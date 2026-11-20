import { Collection, WorkItem } from '../types';

export interface PreparedExportWork {
  key: string;
  workId: string;
  updatedAt: number;
  colName: string;
  markdownText: string;
  photoNoteText: string;
  /** Escaped HTML body + meta fragment without duplicating large base64 imageData */
  htmlMetaHtml: string;
  htmlBodyHtml: string;
  htmlExifHtml: string;
  htmlTagsHtml: string;
  estimatedBytes: number;
}

export interface PdfResizedImageEntry {
  key: string;
  dataUrl: string;
  width: number;
  height: number;
  estimatedBytes: number;
}

export interface ExportCacheStats {
  hits: number;
  misses: number;
  hitRatePct: number;
  workEntries: number;
  imageEntries: number;
  pdfImageEntries: number;
  wrapEntries: number;
  estimatedBytes: number;
  maxBytes: number;
  evictions: number;
  prewarmedCount: number;
}

const MAX_IMAGE_CACHE_BYTES = 18 * 1024 * 1024; // 18 MB soft cap for image DataURLs
const MAX_PDF_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB soft cap for PDF scaled plates
const MAX_TOTAL_CACHE_BYTES = 28 * 1024 * 1024; // 28 MB total ceiling across pools
const MAX_WORK_ENTRIES = 450;
const MAX_IMAGE_ENTRIES = 80;
const MAX_PDF_IMAGE_ENTRIES = 80;
const MAX_WRAP_ENTRIES = 300;

function estimateStringBytes(str?: string): number {
  if (!str) return 0;
  return str.length * 2;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPreparedExportWork(work: WorkItem, colName: string): PreparedExportWork {
  const key = `${work.id}:${work.updatedAt}:${colName}`;
  const formattedBody =
    work.chapters && work.chapters.length > 0
      ? work.chapters.map((ch) => `## ${ch.title}\n\n${ch.content}`).join('\n\n---\n\n')
      : work.content;

  const markdownText =
    work.type === 'writing'
      ? [
          `# ${work.title}`,
          work.subtitle ? `> ${work.subtitle}` : '',
          ``,
          `- 分類：${work.writingGenre || '文字'}`,
          `- 作品集：${colName}${work.category ? ` / ${work.category}` : ''}`,
          `- 日期：${work.createdAt}`,
          work.tags.length > 0 ? `- 標籤：${work.tags.map((t) => `#${t}`).join(' ')}` : '',
          ``,
          `---`,
          ``,
          formattedBody,
        ]
          .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
          .join('\n')
      : '';

  const photoNoteText =
    work.type === 'photography'
      ? [
          `作品標題：${work.title}`,
          work.subtitle ? `副標題：${work.subtitle}` : '',
          `作品集：${colName}${work.category ? ` / ${work.category}` : ''}`,
          `拍攝日期：${work.createdAt}`,
          work.photoMeta?.camera ? `相機：${work.photoMeta.camera}` : '',
          work.photoMeta?.lens ? `鏡頭/焦段：${work.photoMeta.lens}` : '',
          work.photoMeta?.film ? `底片/色調：${work.photoMeta.film}` : '',
          work.photoMeta?.aperture ? `光圈：${work.photoMeta.aperture}` : '',
          work.photoMeta?.shutter ? `快門：${work.photoMeta.shutter}` : '',
          work.photoMeta?.iso ? `ISO：${work.photoMeta.iso}` : '',
          work.photoMeta?.location ? `地點：${work.photoMeta.location}` : '',
          work.tags.length > 0 ? `標籤：${work.tags.map((t) => `#${t}`).join(' ')}` : '',
          work.content ? `\n筆記：\n${work.content}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  const metaParts =
    work.type === 'photography' && work.photoMeta
      ? [
          work.photoMeta.camera,
          work.photoMeta.lens,
          work.photoMeta.film,
          work.photoMeta.aperture,
          work.photoMeta.shutter,
          work.photoMeta.iso ? `ISO ${work.photoMeta.iso}` : '',
          work.photoMeta.location,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  const htmlMetaHtml = `<div class="meta">${escapeHtml(
    work.type === 'photography' ? '攝影' : work.writingGenre || '文字'
  )} · ${escapeHtml(colName)}${
    work.category ? ` / ${escapeHtml(work.category)}` : ''
  } · ${escapeHtml(work.createdAt)}</div><h2>${escapeHtml(work.title)}</h2>${
    work.subtitle ? `<p class="sub">${escapeHtml(work.subtitle)}</p>` : ''
  }`;

  const htmlBodyHtml =
    work.chapters && work.chapters.length > 0
      ? work.chapters
          .map(
            (ch) =>
              `<div class="chapter"><h3>${escapeHtml(ch.title)}</h3><div class="body">${escapeHtml(
                ch.content
              ).replace(/\n/g, '<br/>')}</div></div>`
          )
          .join('')
      : work.content
      ? `<div class="body">${escapeHtml(work.content).replace(/\n/g, '<br/>')}</div>`
      : '';

  const htmlExifHtml = metaParts ? `<p class="exif">${escapeHtml(metaParts)}</p>` : '';
  const htmlTagsHtml =
    work.tags.length > 0
      ? `<p class="tags">${work.tags.map((t) => `#${escapeHtml(t)}`).join('  ')}</p>`
      : '';

  const estimatedBytes =
    estimateStringBytes(markdownText) +
    estimateStringBytes(photoNoteText) +
    estimateStringBytes(htmlMetaHtml) +
    estimateStringBytes(htmlBodyHtml) +
    estimateStringBytes(htmlExifHtml) +
    estimateStringBytes(htmlTagsHtml) +
    128;

  return {
    key,
    workId: work.id,
    updatedAt: work.updatedAt,
    colName,
    markdownText,
    photoNoteText,
    htmlMetaHtml,
    htmlBodyHtml,
    htmlExifHtml,
    htmlTagsHtml,
    estimatedBytes,
  };
}

class ExportMemoryCache {
  private workMap = new Map<string, PreparedExportWork>();
  private workBytes = 0;

  private imageMap = new Map<string, { dataUrl: string; bytes: number }>();
  private imageBytes = 0;
  private inflightImages = new Map<string, Promise<string | undefined>>();

  private pdfImageMap = new Map<string, PdfResizedImageEntry>();
  private pdfImageBytes = 0;

  private wrapMap = new Map<string, { lines: string[]; bytes: number }>();
  private wrapBytes = 0;

  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private prewarmedCount = 0;
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  getStats(): ExportCacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRatePct = totalRequests > 0 ? Math.round((this.hits / totalRequests) * 100) : 0;
    const estimatedBytes = this.workBytes + this.imageBytes + this.pdfImageBytes + this.wrapBytes;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRatePct,
      workEntries: this.workMap.size,
      imageEntries: this.imageMap.size,
      pdfImageEntries: this.pdfImageMap.size,
      wrapEntries: this.wrapMap.size,
      estimatedBytes,
      maxBytes: MAX_TOTAL_CACHE_BYTES,
      evictions: this.evictions,
      prewarmedCount: this.prewarmedCount,
    };
  }

  getOrBuildPreparedWork(work: WorkItem, colName: string): PreparedExportWork {
    const key = `${work.id}:${work.updatedAt}:${colName}`;
    const existing = this.workMap.get(key);
    if (existing) {
      // Refresh LRU position
      this.workMap.delete(key);
      this.workMap.set(key, existing);
      this.hits += 1;
      return existing;
    }

    this.misses += 1;
    const built = buildPreparedExportWork(work, colName);

    // Purge any stale versions of the same workId so old edits do not linger
    for (const [k, v] of this.workMap.entries()) {
      if (v.workId === work.id && k !== key) {
        this.workMap.delete(k);
        this.workBytes = Math.max(0, this.workBytes - v.estimatedBytes);
      }
    }

    this.workMap.set(key, built);
    this.workBytes += built.estimatedBytes;

    while (this.workMap.size > MAX_WORK_ENTRIES) {
      const oldestKey = this.workMap.keys().next().value;
      if (!oldestKey) break;
      const evicted = this.workMap.get(oldestKey);
      this.workMap.delete(oldestKey);
      if (evicted) {
        this.workBytes = Math.max(0, this.workBytes - evicted.estimatedBytes);
      }
      this.evictions += 1;
    }

    return built;
  }

  invalidateWork(workId: string): void {
    let changed = false;
    for (const [k, v] of this.workMap.entries()) {
      if (v.workId === workId) {
        this.workMap.delete(k);
        this.workBytes = Math.max(0, this.workBytes - v.estimatedBytes);
        changed = true;
      }
    }
    for (const [k, v] of this.pdfImageMap.entries()) {
      if (k.startsWith(`${workId}:`)) {
        this.pdfImageMap.delete(k);
        this.pdfImageBytes = Math.max(0, this.pdfImageBytes - v.estimatedBytes);
        changed = true;
      }
    }
    for (const [k, v] of this.wrapMap.entries()) {
      if (k.startsWith(`${workId}:`)) {
        this.wrapMap.delete(k);
        this.wrapBytes = Math.max(0, this.wrapBytes - v.bytes);
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  getCachedImageDataUrl(src: string): string | undefined {
    const entry = this.imageMap.get(src);
    if (entry) {
      this.imageMap.delete(src);
      this.imageMap.set(src, entry);
      this.hits += 1;
      return entry.dataUrl;
    }
    this.misses += 1;
    return undefined;
  }

  setCachedImageDataUrl(src: string, dataUrl: string): void {
    const bytes = estimateStringBytes(dataUrl);
    if (bytes > MAX_IMAGE_CACHE_BYTES * 0.5) {
      // Skip caching single ultra-huge blobs to keep memory footprint lean
      return;
    }
    const prev = this.imageMap.get(src);
    if (prev) {
      this.imageMap.delete(src);
      this.imageBytes = Math.max(0, this.imageBytes - prev.bytes);
    }
    this.imageMap.set(src, { dataUrl, bytes });
    this.imageBytes += bytes;

    while (this.imageMap.size > MAX_IMAGE_ENTRIES || this.imageBytes > MAX_IMAGE_CACHE_BYTES) {
      const oldestKey = this.imageMap.keys().next().value;
      if (!oldestKey) break;
      const evicted = this.imageMap.get(oldestKey);
      this.imageMap.delete(oldestKey);
      if (evicted) {
        this.imageBytes = Math.max(0, this.imageBytes - evicted.bytes);
      }
      this.evictions += 1;
    }
    this.notify();
  }

  async resolveImageCached(
    src: string | undefined,
    loader: (rawSrc: string) => Promise<string | undefined>
  ): Promise<string | undefined> {
    if (!src) return undefined;
    if (src.startsWith('data:')) return src;

    const cached = this.getCachedImageDataUrl(src);
    if (cached) return cached;

    const inflight = this.inflightImages.get(src);
    if (inflight) return inflight;

    const task = loader(src)
      .then((resolved) => {
        if (resolved && resolved.startsWith('data:')) {
          this.setCachedImageDataUrl(src, resolved);
        }
        return resolved;
      })
      .finally(() => {
        this.inflightImages.delete(src);
      });

    this.inflightImages.set(src, task);
    return task;
  }

  getPdfResizedImage(key: string): PdfResizedImageEntry | undefined {
    const entry = this.pdfImageMap.get(key);
    if (entry) {
      this.pdfImageMap.delete(key);
      this.pdfImageMap.set(key, entry);
      this.hits += 1;
      return entry;
    }
    this.misses += 1;
    return undefined;
  }

  setPdfResizedImage(entry: PdfResizedImageEntry): void {
    if (entry.estimatedBytes > MAX_PDF_IMAGE_BYTES * 0.5) return;
    const prev = this.pdfImageMap.get(entry.key);
    if (prev) {
      this.pdfImageMap.delete(entry.key);
      this.pdfImageBytes = Math.max(0, this.pdfImageBytes - prev.estimatedBytes);
    }
    this.pdfImageMap.set(entry.key, entry);
    this.pdfImageBytes += entry.estimatedBytes;

    while (
      this.pdfImageMap.size > MAX_PDF_IMAGE_ENTRIES ||
      this.pdfImageBytes > MAX_PDF_IMAGE_BYTES
    ) {
      const oldestKey = this.pdfImageMap.keys().next().value;
      if (!oldestKey) break;
      const evicted = this.pdfImageMap.get(oldestKey);
      this.pdfImageMap.delete(oldestKey);
      if (evicted) {
        this.pdfImageBytes = Math.max(0, this.pdfImageBytes - evicted.estimatedBytes);
      }
      this.evictions += 1;
    }
  }

  getOrWrapLines(key: string, compute: () => string[]): string[] {
    const existing = this.wrapMap.get(key);
    if (existing) {
      this.wrapMap.delete(key);
      this.wrapMap.set(key, existing);
      this.hits += 1;
      return existing.lines;
    }
    this.misses += 1;
    const lines = compute();
    const bytes = lines.reduce((sum, l) => sum + l.length * 2 + 16, 32);
    this.wrapMap.set(key, { lines, bytes });
    this.wrapBytes += bytes;

    while (this.wrapMap.size > MAX_WRAP_ENTRIES) {
      const oldestKey = this.wrapMap.keys().next().value;
      if (!oldestKey) break;
      const evicted = this.wrapMap.get(oldestKey);
      this.wrapMap.delete(oldestKey);
      if (evicted) {
        this.wrapBytes = Math.max(0, this.wrapBytes - evicted.bytes);
      }
      this.evictions += 1;
    }
    return lines;
  }

  /**
   * Non-blocking incremental pre-warming of lightweight prepared export work objects
   * so large archive exports reuse pre-built Markdown/EXIF/HTML fragments immediately.
   */
  async prewarmWorks(
    works: WorkItem[],
    collections: Collection[],
    yieldFn?: () => Promise<void>
  ): Promise<number> {
    const colMap = new Map(collections.map((c) => [c.id, c.name]));
    const yieldStep = yieldFn || (() => new Promise<void>((r) => setTimeout(r, 0)));
    let newlyCached = 0;

    for (let i = 0; i < works.length; i++) {
      const w = works[i];
      if (w.isPrivate && w.isSealed) continue;
      const colName = colMap.get(w.collectionId) || '未分類';
      const key = `${w.id}:${w.updatedAt}:${colName}`;
      if (!this.workMap.has(key)) {
        const built = buildPreparedExportWork(w, colName);
        this.workMap.set(key, built);
        this.workBytes += built.estimatedBytes;
        while (this.workMap.size > MAX_WORK_ENTRIES) {
          const oldestKey = this.workMap.keys().next().value;
          if (!oldestKey) break;
          const evicted = this.workMap.get(oldestKey);
          this.workMap.delete(oldestKey);
          if (evicted) {
            this.workBytes = Math.max(0, this.workBytes - evicted.estimatedBytes);
          }
          this.evictions += 1;
        }
        newlyCached += 1;
      }

      if (i > 0 && i % 15 === 0) {
        await yieldStep();
      }
    }

    if (newlyCached > 0) {
      this.prewarmedCount += newlyCached;
      this.notify();
    }
    return newlyCached;
  }

  notifyUpdated(): void {
    this.notify();
  }

  clear(): void {
    this.workMap.clear();
    this.workBytes = 0;
    this.imageMap.clear();
    this.imageBytes = 0;
    this.pdfImageMap.clear();
    this.pdfImageBytes = 0;
    this.wrapMap.clear();
    this.wrapBytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.prewarmedCount = 0;
    this.notify();
  }
}

export const exportCache = new ExportMemoryCache();
