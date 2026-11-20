import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { jsPDF } from 'jspdf';
import { Collection, WorkItem } from '../types';
import { exportCache } from './exportCache';

export type PdfPageSize = 'a5' | 'a4';
export type PdfPaperTone = 'ivory' | 'white' | 'warm-gray';
export type PdfFontStyle = 'editorial' | 'sans';

export interface PdfSubGroupInput {
  key: string;
  title: string;
  isNamedCategory?: boolean;
  workIds: string[];
}

export interface PdfSectionGroupInput {
  key: string;
  title: string;
  subtitle?: string;
  workIds: string[];
  subGroups?: PdfSubGroupInput[];
}

export interface PdfEbookOptions {
  bookTitle: string;
  bookSubtitle?: string;
  authorName: string;
  sealText?: string;
  pageSize: PdfPageSize;
  paperTone: PdfPaperTone;
  fontStyle: PdfFontStyle;
  includeCover: boolean;
  includeToc: boolean;
  includeSectionDividers?: boolean;
  includeSubtitle?: boolean;
  includeGenre?: boolean;
  includeCollection?: boolean;
  includeDate?: boolean;
  includeTags?: boolean;
  includeExif?: boolean;
  groupByCollection?: boolean;
  groupSubcategoriesInCollection?: boolean;
  sectionGroups?: PdfSectionGroupInput[];
  onProgress?: (label: string, percent: number) => void;
  yieldHook?: () => Promise<void>;
}

export interface PdfExportResult {
  filename: string;
  locationLabel: string;
  byteSize: number;
  pageCount: number;
}

interface Palette {
  bg: string;
  text: string;
  muted: string;
  hairline: string;
  accent: string;
  plateBg: string;
}

const PALETTES: Record<PdfPaperTone, Palette> = {
  ivory: {
    bg: '#F8F6F0',
    text: '#1C1917',
    muted: '#78716C',
    hairline: '#DEDAD0',
    accent: '#9E3B33',
    plateBg: '#EFECE4',
  },
  white: {
    bg: '#FFFFFF',
    text: '#18181B',
    muted: '#71717A',
    hairline: '#E4E4E7',
    accent: '#284152',
    plateBg: '#F4F4F5',
  },
  'warm-gray': {
    bg: '#EAE7DF',
    text: '#1C1917',
    muted: '#57534E',
    hairline: '#D2CEC4',
    accent: '#284152',
    plateBg: '#DFDCD3',
  },
};

const PAGE_PX_W = 1240;
const PAGE_PX_H = 1754;
const PAD_X = 112;
const CONTENT_W = PAGE_PX_W - PAD_X * 2;
const TOP_Y = 148;
const BOTTOM_Y = PAGE_PX_H - 138;

function getFontStack(style: PdfFontStyle): string {
  if (style === 'sans') {
    return '"Noto Sans TC", "Plus Jakarta Sans", "PingFang TC", "Microsoft JhengHei", sans-serif';
  }
  return '"Noto Serif TC", "Cormorant Garamond", "PingFang TC", "Songti TC", "PMingLiU", Georgia, serif';
}

const SANS_STACK = '"Noto Sans TC", "Plus Jakarta Sans", "PingFang TC", "Microsoft JhengHei", sans-serif';

function createBlankPage(palette: Palette): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_PX_W;
  canvas.height = PAGE_PX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立 PDF 畫布內容');
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, PAGE_PX_W, PAGE_PX_H);
  return { canvas, ctx };
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const out: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const ch of para) {
      const candidate = line + ch;
      if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
        out.push(line);
        line = ch;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadCachedPdfPlate(
  work: WorkItem,
  src: string,
  maxBoxW: number,
  maxBoxH: number
): Promise<{ img: HTMLImageElement; drawW: number; drawH: number } | null> {
  const plateKey = `${work.id}:${work.updatedAt}:${maxBoxW}x${maxBoxH}`;
  const cached = exportCache.getPdfResizedImage(plateKey);
  if (cached) {
    const cachedImg = await loadHtmlImage(cached.dataUrl);
    if (cachedImg) {
      return { img: cachedImg, drawW: cached.width, drawH: cached.height };
    }
  }

  const rawImg = await loadHtmlImage(src);
  if (!rawImg || rawImg.naturalWidth <= 0 || rawImg.naturalHeight <= 0) {
    return null;
  }

  const ratio = Math.min(maxBoxW / rawImg.naturalWidth, maxBoxH / rawImg.naturalHeight);
  const drawW = Math.round(rawImg.naturalWidth * ratio);
  const drawH = Math.round(rawImg.naturalHeight * ratio);

  // Downscale once into a compact plate DataURL so repeat exports avoid decoding giant originals
  let offscreen: HTMLCanvasElement | null = null;
  try {
    offscreen = document.createElement('canvas');
    offscreen.width = drawW;
    offscreen.height = drawH;
    const octx = offscreen.getContext('2d');
    if (octx) {
      octx.drawImage(rawImg, 0, 0, drawW, drawH);
      const compactUrl = offscreen.toDataURL('image/jpeg', 0.92);
      exportCache.setPdfResizedImage({
        key: plateKey,
        dataUrl: compactUrl,
        width: drawW,
        height: drawH,
        estimatedBytes: compactUrl.length * 2,
      });
    }
  } catch {
    // Proceed cleanly even if offscreen serialization fails
  } finally {
    if (offscreen) {
      offscreen.width = 0;
      offscreen.height = 0;
    }
  }

  return { img: rawImg, drawW, drawH };
}

function stampRunningHeaderFooter(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  bookTitle: string,
  sectionLabel: string,
  pageNumber: number
) {
  ctx.save();
  ctx.fillStyle = palette.muted;
  ctx.font = `400 20px ${SANS_STACK}`;
  ctx.textBaseline = 'alphabetic';

  ctx.textAlign = 'left';
  ctx.fillText(bookTitle.slice(0, 28), PAD_X, 82);

  ctx.textAlign = 'right';
  ctx.fillText(sectionLabel.slice(0, 28), PAGE_PX_W - PAD_X, 82);

  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD_X, 100);
  ctx.lineTo(PAGE_PX_W - PAD_X, 100);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(PAD_X, PAGE_PX_H - 96);
  ctx.lineTo(PAGE_PX_W - PAD_X, PAGE_PX_H - 96);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `400 21px ${SANS_STACK}`;
  ctx.fillText(`— ${pageNumber} —`, PAGE_PX_W / 2, PAGE_PX_H - 58);
  ctx.restore();
}

function renderCoverPage(
  palette: Palette,
  fontStack: string,
  options: PdfEbookOptions,
  workCount: number
): HTMLCanvasElement {
  const { canvas, ctx } = createBlankPage(palette);

  // Subtle editorial border frame
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 2;
  ctx.strokeRect(72, 72, PAGE_PX_W - 144, PAGE_PX_H - 144);

  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1;
  ctx.strokeRect(86, 86, PAGE_PX_W - 172, PAGE_PX_H - 172);

  // Top eyebrow
  ctx.fillStyle = palette.muted;
  ctx.font = `500 22px ${SANS_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('FOLIO · 離線個人典藏讀本', PAD_X + 24, 168);

  // Accent bar
  ctx.fillStyle = palette.accent;
  ctx.fillRect(PAD_X + 24, 218, 72, 4);

  // Book Title
  ctx.fillStyle = palette.text;
  ctx.font = `600 76px ${fontStack}`;
  const titleLines = wrapLines(ctx, options.bookTitle || '拾光卷宗典藏集', CONTENT_W - 48).slice(0, 4);
  let cursorY = 460;
  for (const line of titleLines) {
    ctx.fillText(line, PAD_X + 24, cursorY);
    cursorY += 104;
  }

  // Optional Book Subtitle
  if (options.bookSubtitle?.trim()) {
    cursorY += 20;
    ctx.fillStyle = palette.muted;
    ctx.font = `400 32px ${fontStack}`;
    const subLines = wrapLines(ctx, options.bookSubtitle.trim(), CONTENT_W - 48).slice(0, 4);
    for (const line of subLines) {
      ctx.fillText(line, PAD_X + 24, cursorY);
      cursorY += 52;
    }
  }

  // Bottom Author & Seal block
  const footerY = PAGE_PX_H - 220;
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD_X + 24, footerY - 36);
  ctx.lineTo(PAGE_PX_W - PAD_X - 24, footerY - 36);
  ctx.stroke();

  if (options.sealText?.trim()) {
    const sealSize = 58;
    const sx = PAD_X + 24;
    const sy = footerY;
    ctx.fillStyle = palette.accent;
    ctx.fillRect(sx, sy, sealSize, sealSize);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `600 32px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.sealText.trim().slice(0, 1), sx + sealSize / 2, sy + sealSize / 2 + 1);
  }

  const textStartX = options.sealText?.trim() ? PAD_X + 102 : PAD_X + 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = palette.text;
  ctx.font = `600 30px ${fontStack}`;
  ctx.fillText(options.authorName || '林硯', textStartX, footerY + 2);

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  ctx.fillStyle = palette.muted;
  ctx.font = `400 22px ${SANS_STACK}`;
  ctx.fillText(`共收錄 ${workCount} 件作品 · ${todayStr} 編訂`, textStartX, footerY + 42);

  return canvas;
}

interface TocEntry {
  kind?: 'group' | 'subgroup' | 'work';
  numLabel?: string;
  title: string;
  meta: string;
  pageNumber: number;
}

function encodeAndReleaseCanvas(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function renderTocPages(
  palette: Palette,
  fontStack: string,
  bookTitle: string,
  entries: TocEntry[],
  startingPageNum: number
): string[] {
  const pages: string[] = [];
  const rowH = 74;
  const firstPageStart = TOP_Y + 96;
  const maxPerFirst = Math.floor((BOTTOM_Y - firstPageStart) / rowH);
  const maxPerNext = Math.floor((BOTTOM_Y - TOP_Y) / rowH);

  let idx = 0;
  let pageIndex = 0;
  let workCounter = 0;

  while (idx < entries.length || pageIndex === 0) {
    const { canvas, ctx } = createBlankPage(palette);
    let y = TOP_Y;

    if (pageIndex === 0) {
      ctx.fillStyle = palette.text;
      ctx.font = `600 44px ${fontStack}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('目錄', PAD_X, y);
      y += 66;
      ctx.fillStyle = palette.accent;
      ctx.fillRect(PAD_X, y, 48, 3);
      y += 34;
    }

    const limit = pageIndex === 0 ? maxPerFirst : maxPerNext;
    const slice = entries.slice(idx, idx + limit);

    for (let i = 0; i < slice.length; i++) {
      const entry = slice[i];

      if (entry.kind === 'group') {
        ctx.save();
        ctx.fillStyle = palette.plateBg;
        ctx.fillRect(PAD_X, y + 6, CONTENT_W, 52);
        ctx.fillStyle = palette.accent;
        ctx.fillRect(PAD_X, y + 6, 6, 52);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = palette.text;
        ctx.font = `600 25px ${fontStack}`;
        ctx.fillText(entry.title.slice(0, 24), PAD_X + 22, y + 32);

        if (entry.meta) {
          ctx.textAlign = 'right';
          ctx.fillStyle = palette.muted;
          ctx.font = `400 19px ${SANS_STACK}`;
          ctx.fillText(entry.meta.slice(0, 18), PAGE_PX_W - PAD_X - 72, y + 32);
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = palette.accent;
        ctx.font = `600 21px ${SANS_STACK}`;
        ctx.fillText(`${entry.pageNumber}`, PAGE_PX_W - PAD_X - 16, y + 32);
        ctx.restore();
      } else if (entry.kind === 'subgroup') {
        ctx.save();
        ctx.fillStyle = palette.muted;
        ctx.fillRect(PAD_X + 22, y + 18, 3, 28);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = palette.text;
        ctx.font = `500 23px ${fontStack}`;
        ctx.fillText(entry.title.slice(0, 22), PAD_X + 38, y + 32);

        if (entry.meta) {
          ctx.textAlign = 'right';
          ctx.fillStyle = palette.muted;
          ctx.font = `400 18px ${SANS_STACK}`;
          ctx.fillText(entry.meta.slice(0, 16), PAGE_PX_W - PAD_X - 64, y + 32);
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = palette.text;
        ctx.font = `500 21px ${SANS_STACK}`;
        ctx.fillText(`${entry.pageNumber}`, PAGE_PX_W - PAD_X, y + 32);

        ctx.strokeStyle = palette.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_X + 22, y + 62);
        ctx.lineTo(PAGE_PX_W - PAD_X, y + 62);
        ctx.stroke();
        ctx.restore();
      } else {
        workCounter++;
        const numStr = entry.numLabel || String(workCounter).padStart(2, '0');

        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = palette.muted;
        ctx.font = `400 22px ${SANS_STACK}`;
        ctx.fillText(numStr, PAD_X, y + 6);

        ctx.fillStyle = palette.text;
        ctx.font = `600 28px ${fontStack}`;
        ctx.fillText(entry.title.slice(0, 26), PAD_X + 48, y);

        ctx.fillStyle = palette.muted;
        ctx.font = `400 20px ${SANS_STACK}`;
        ctx.fillText(entry.meta.slice(0, 40), PAD_X + 48, y + 36);

        ctx.textAlign = 'right';
        ctx.fillStyle = palette.text;
        ctx.font = `500 22px ${SANS_STACK}`;
        ctx.fillText(`${entry.pageNumber}`, PAGE_PX_W - PAD_X, y + 6);

        ctx.strokeStyle = palette.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_X, y + 64);
        ctx.lineTo(PAGE_PX_W - PAD_X, y + 64);
        ctx.stroke();
      }

      y += rowH;
    }

    stampRunningHeaderFooter(ctx, palette, bookTitle, '目錄', startingPageNum + pageIndex);
    pages.push(encodeAndReleaseCanvas(canvas));
    idx += slice.length;
    pageIndex++;
    if (idx >= entries.length) break;
  }

  return pages;
}

function drawGroupDividerContent(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  fontStack: string,
  sectionIndex: number,
  groupTitle: string,
  groupSubtitle: string | undefined,
  itemCount: number
) {
  ctx.save();
  // Inner architectural frame for section divider plate
  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(PAD_X, TOP_Y + 36, CONTENT_W, BOTTOM_Y - TOP_Y - 72);

  const centerY = Math.round((TOP_Y + BOTTOM_Y) * 0.44);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.fillStyle = palette.accent;
  ctx.font = `600 22px ${SANS_STACK}`;
  ctx.fillText(`SECTION · 第 ${String(sectionIndex + 1).padStart(2, '0')} 輯`, PAGE_PX_W / 2, centerY - 120);

  ctx.fillStyle = palette.accent;
  ctx.fillRect(PAGE_PX_W / 2 - 36, centerY - 72, 72, 4);

  ctx.fillStyle = palette.text;
  ctx.font = `600 58px ${fontStack}`;
  const titleLines = wrapLines(ctx, groupTitle, CONTENT_W - 140).slice(0, 3);
  let ty = centerY - 30;
  for (const tl of titleLines) {
    ctx.fillText(tl, PAGE_PX_W / 2, ty);
    ty += 82;
  }

  if (groupSubtitle?.trim()) {
    ty += 12;
    ctx.fillStyle = palette.muted;
    ctx.font = `400 28px ${fontStack}`;
    const subLines = wrapLines(ctx, groupSubtitle.trim(), CONTENT_W - 160).slice(0, 3);
    for (const sl of subLines) {
      ctx.fillText(sl, PAGE_PX_W / 2, ty);
      ty += 44;
    }
  }

  ctx.fillStyle = palette.muted;
  ctx.font = `400 22px ${SANS_STACK}`;
  ctx.fillText(`本輯收錄 ${itemCount} 件作品`, PAGE_PX_W / 2, BOTTOM_Y - 140);
  ctx.restore();
}

function drawSubGroupDividerContent(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  fontStack: string,
  parentTitle: string,
  subTitle: string,
  itemCount: number
) {
  ctx.save();
  const centerY = Math.round((TOP_Y + BOTTOM_Y) * 0.45);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAGE_PX_W / 2 - 140, centerY - 110);
  ctx.lineTo(PAGE_PX_W / 2 + 140, centerY - 110);
  ctx.stroke();

  ctx.fillStyle = palette.muted;
  ctx.font = `500 21px ${SANS_STACK}`;
  ctx.fillText(`SUB-SECTION · ${parentTitle.slice(0, 22)}`, PAGE_PX_W / 2, centerY - 78);

  ctx.fillStyle = palette.text;
  ctx.font = `600 46px ${fontStack}`;
  const titleLines = wrapLines(ctx, subTitle, CONTENT_W - 180).slice(0, 3);
  let ty = centerY - 18;
  for (const tl of titleLines) {
    ctx.fillText(tl, PAGE_PX_W / 2, ty);
    ty += 66;
  }

  ctx.fillStyle = palette.accent;
  ctx.fillRect(PAGE_PX_W / 2 - 24, ty + 18, 48, 3);

  ctx.fillStyle = palette.muted;
  ctx.font = `400 21px ${SANS_STACK}`;
  ctx.fillText(`本子分類收錄 ${itemCount} 件作品`, PAGE_PX_W / 2, ty + 48);

  ctx.strokeStyle = palette.hairline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAGE_PX_W / 2 - 140, ty + 112);
  ctx.lineTo(PAGE_PX_W / 2 + 140, ty + 112);
  ctx.stroke();
  ctx.restore();
}

export async function exportWorksAsPdfEbook(
  works: WorkItem[],
  collections: Collection[],
  options: PdfEbookOptions
): Promise<PdfExportResult> {
  const palette = PALETTES[options.paperTone];
  const fontStack = getFontStack(options.fontStyle);
  const colObjMap = new Map(collections.map((c) => [c.id, c]));

  const usableWorks = works.filter((w) => !(w.isPrivate && w.isSealed));
  if (usableWorks.length === 0) {
    throw new Error('沒有可匯出的未鎖定作品（私密作品請先解鎖後再匯出）。');
  }

  interface ResolvedSubGroup {
    key: string;
    title: string;
    isNamedCategory: boolean;
    works: WorkItem[];
  }

  interface ResolvedGroup {
    key: string;
    title: string;
    subtitle?: string;
    works: WorkItem[];
    subGroups?: ResolvedSubGroup[];
  }

  const buildSubGroupsForWorks = (
    parentKey: string,
    groupWorks: WorkItem[],
    categoriesOrder: string[] = []
  ): ResolvedSubGroup[] | undefined => {
    const hasNamed = groupWorks.some((w) => Boolean(w.category));
    if (!hasNamed) return undefined;
    const subMap = new Map<string, ResolvedSubGroup>();
    for (const w of groupWorks) {
      const cat = w.category || '';
      const sk = `${parentKey}::${cat || '__uncat__'}`;
      let sg = subMap.get(sk);
      if (!sg) {
        sg = {
          key: sk,
          title: cat || '未指定子分類',
          isNamedCategory: Boolean(cat),
          works: [],
        };
        subMap.set(sk, sg);
      }
      sg.works.push(w);
    }
    const rank = new Map<string, number>();
    categoriesOrder.forEach((c, idx) => rank.set(`${parentKey}::${c}`, idx));
    rank.set(`${parentKey}::__uncat__`, 99999);
    const list = Array.from(subMap.values()).sort(
      (a, b) => (rank.get(a.key) ?? 50000) - (rank.get(b.key) ?? 50000)
    );
    return list.length > 1 || (list.length === 1 && list[0].isNamedCategory) ? list : undefined;
  };

  const resolvedGroups: ResolvedGroup[] = [];
  if (options.groupByCollection) {
    if (options.sectionGroups && options.sectionGroups.length > 0) {
      const workById = new Map(usableWorks.map((w) => [w.id, w]));
      const assigned = new Set<string>();
      for (const sg of options.sectionGroups) {
        const groupWorks = sg.workIds
          .map((id) => workById.get(id))
          .filter((item): item is WorkItem => Boolean(item));
        if (groupWorks.length === 0) continue;
        groupWorks.forEach((gw) => assigned.add(gw.id));

        let resolvedSubGroups: ResolvedSubGroup[] | undefined;
        if (sg.subGroups && sg.subGroups.length > 0) {
          const subAssigned = new Set<string>();
          const built: ResolvedSubGroup[] = [];
          for (const sub of sg.subGroups) {
            const sw = sub.workIds
              .map((id) => workById.get(id))
              .filter((item): item is WorkItem => Boolean(item));
            if (sw.length > 0) {
              sw.forEach((x) => subAssigned.add(x.id));
              built.push({
                key: sub.key,
                title: sub.title,
                isNamedCategory: sub.isNamedCategory ?? sub.title !== '未指定子分類',
                works: sw,
              });
            }
          }
          const subLeft = groupWorks.filter((w) => !subAssigned.has(w.id));
          if (subLeft.length > 0) {
            built.push({
              key: `${sg.key}::__uncat__`,
              title: '未指定子分類',
              isNamedCategory: false,
              works: subLeft,
            });
          }
          if (built.length > 1 || (built.length === 1 && built[0].isNamedCategory)) {
            resolvedSubGroups = built;
          }
        }

        resolvedGroups.push({
          key: sg.key,
          title: sg.title,
          subtitle: sg.subtitle,
          works: resolvedSubGroups ? resolvedSubGroups.flatMap((s) => s.works) : groupWorks,
          subGroups: resolvedSubGroups,
        });
      }
      const leftovers = usableWorks.filter((w) => !assigned.has(w.id));
      if (leftovers.length > 0) {
        resolvedGroups.push({
          key: '__other__',
          title: '其他作品',
          works: leftovers,
        });
      }
    } else {
      const distinctCols = new Set(usableWorks.map((w) => w.collectionId || '__none__'));
      const groupBySub = distinctCols.size === 1;
      const bucketMap = new Map<string, ResolvedGroup>();
      for (const w of usableWorks) {
        const col = w.collectionId ? colObjMap.get(w.collectionId) : undefined;
        const key = groupBySub
          ? `${w.collectionId || '__none__'}::${w.category || '__uncat__'}`
          : w.collectionId && col
          ? col.id
          : '__none__';
        const title = groupBySub
          ? w.category || '未指定子分類'
          : col
          ? col.name
          : '未加入作品集';
        const subtitle = groupBySub ? col?.name : col?.description;
        let grp = bucketMap.get(key);
        if (!grp) {
          grp = { key, title, subtitle, works: [] };
          bucketMap.set(key, grp);
          resolvedGroups.push(grp);
        }
        grp.works.push(w);
      }

      if (!groupBySub && options.groupSubcategoriesInCollection) {
        for (const grp of resolvedGroups) {
          const col = colObjMap.get(grp.key);
          const subGroups = buildSubGroupsForWorks(grp.key, grp.works, col?.categories || []);
          if (subGroups) {
            grp.subGroups = subGroups;
            grp.works = subGroups.flatMap((s) => s.works);
          }
        }
      }
    }
  } else {
    resolvedGroups.push({
      key: '__flat__',
      title: '',
      works: usableWorks,
    });
  }

  const orderedWorksFlat = resolvedGroups.flatMap((g) => g.works);
  const includeSectionDividers = options.includeSectionDividers ?? true;
  const showGroupTocHeaders = Boolean(
    options.groupByCollection && resolvedGroups.length > 1
  );
  const showGroupDividerPages = showGroupTocHeaders && includeSectionDividers;

  const hasGroupSubSections = (g: ResolvedGroup): boolean =>
    Boolean(
      options.groupByCollection &&
        g.subGroups &&
        (g.subGroups.length > 1 || (g.subGroups.length === 1 && g.subGroups[0].isNamedCategory))
    );

  options.onProgress?.('正在載入排版字體...', 5);
  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // proceed with system fonts
  }

  interface RenderedPage {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    sectionLabel: string;
  }

  // Deterministic cover & TOC page counts allow streaming each page directly to JPEG & freeing canvas RAM
  const coverCount = options.includeCover ? 1 : 0;
  let estTocPages = 0;
  if (options.includeToc) {
    const firstPageMax = Math.floor((BOTTOM_Y - (TOP_Y + 96)) / 74);
    const nextPageMax = Math.floor((BOTTOM_Y - TOP_Y) / 74);
    const totalSubRows = resolvedGroups.reduce(
      (sum, g) => sum + (hasGroupSubSections(g) ? g.subGroups!.length : 0),
      0
    );
    const totalTocRows =
      (showGroupTocHeaders ? resolvedGroups.length : 0) +
      totalSubRows +
      orderedWorksFlat.length;
    estTocPages =
      totalTocRows <= firstPageMax
        ? 1
        : 1 + Math.ceil((totalTocRows - firstPageMax) / nextPageMax);
  }
  const contentStartPageNum = coverCount + estTocPages + 1;

  const contentDataUrls: string[] = [];
  type TocBlueprintItem =
    | { kind: 'group'; title: string; count: number; startIdx: number }
    | { kind: 'subgroup'; title: string; count: number; startIdx: number }
    | { kind: 'work'; work: WorkItem; startIdx: number; colName: string; workNum: number };
  const tocBlueprints: TocBlueprintItem[] = [];
  let currentPage: RenderedPage | null = null;

  const flushCurrentPage = () => {
    if (!currentPage) return;
    const pageNum = contentStartPageNum + contentDataUrls.length;
    stampRunningHeaderFooter(
      currentPage.ctx,
      palette,
      options.bookTitle,
      currentPage.sectionLabel,
      pageNum
    );
    contentDataUrls.push(encodeAndReleaseCanvas(currentPage.canvas));
    currentPage = null;
  };

  const pushNewPage = (sectionLabel: string): RenderedPage => {
    flushCurrentPage();
    const { canvas, ctx } = createBlankPage(palette);
    currentPage = { canvas, ctx, sectionLabel };
    return currentPage;
  };

  const yieldStep = options.yieldHook || (() => new Promise<void>((r) => setTimeout(r, 0)));

  const includeSubtitle = options.includeSubtitle ?? true;
  const includeGenre = options.includeGenre ?? true;
  const includeCollection = options.includeCollection ?? true;
  const includeDate = options.includeDate ?? true;
  const includeTags = options.includeTags ?? true;
  const includeExif = options.includeExif ?? true;

  try {
    let processedWorks = 0;
    for (let gIdx = 0; gIdx < resolvedGroups.length; gIdx++) {
      const grp = resolvedGroups[gIdx];
      if (showGroupTocHeaders) {
        tocBlueprints.push({
          kind: 'group',
          title: grp.title,
          count: grp.works.length,
          startIdx: contentDataUrls.length,
        });
      }
      if (showGroupDividerPages) {
        const dividerPage = pushNewPage(grp.title);
        drawGroupDividerContent(
          dividerPage.ctx,
          palette,
          fontStack,
          gIdx,
          grp.title,
          grp.subtitle,
          grp.works.length
        );
      }

      const subChunks: Array<{ subTitle?: string; works: WorkItem[] }> = hasGroupSubSections(grp)
        ? grp.subGroups!.map((sg) => ({ subTitle: sg.title, works: sg.works }))
        : [{ works: grp.works }];

      for (const chunk of subChunks) {
        if (chunk.subTitle) {
          tocBlueprints.push({
            kind: 'subgroup',
            title: chunk.subTitle,
            count: chunk.works.length,
            startIdx: contentDataUrls.length,
          });
          if (includeSectionDividers) {
            const subDividerPage = pushNewPage(`${grp.title} · ${chunk.subTitle}`);
            drawSubGroupDividerContent(
              subDividerPage.ctx,
              palette,
              fontStack,
              grp.title,
              chunk.subTitle,
              chunk.works.length
            );
          }
        }

        for (let localIdx = 0; localIdx < chunk.works.length; localIdx++) {
          const w = chunk.works[localIdx];
          processedWorks++;
          const colName = w.collectionId ? colObjMap.get(w.collectionId)?.name || '未分類' : '未分類';
          const pct = 10 + Math.round((processedWorks / orderedWorksFlat.length) * 65);
          options.onProgress?.(
            `正在排版 (${processedWorks}/${orderedWorksFlat.length})：${w.title}`,
            pct
          );
          await yieldStep();

          const sectionTitle = w.title;
          let page = pushNewPage(sectionTitle);
          let y = TOP_Y;

          tocBlueprints.push({
            kind: 'work',
            work: w,
            startIdx: contentDataUrls.length,
            colName,
            workNum: processedWorks,
          });

      // Eyebrow metadata
      const metaParts = [
        includeGenre
          ? w.type === 'photography'
            ? '攝影紀實'
            : w.writingGenre || '文字創作'
          : '',
        includeCollection ? (w.category ? `${colName} / ${w.category}` : colName) : '',
        includeDate ? w.createdAt : '',
      ].filter(Boolean);

      if (metaParts.length > 0) {
        page.ctx.textAlign = 'left';
        page.ctx.textBaseline = 'top';
        page.ctx.fillStyle = palette.muted;
        page.ctx.font = `400 22px ${SANS_STACK}`;
        page.ctx.fillText(metaParts.join(' · '), PAD_X, y);
        y += 40;
      }

      // Title
      page.ctx.textAlign = 'left';
      page.ctx.textBaseline = 'top';
      page.ctx.fillStyle = palette.text;
      page.ctx.font = `600 46px ${fontStack}`;
      const titleLines = wrapLines(page.ctx, w.title, CONTENT_W).slice(0, 3);
      for (const tl of titleLines) {
        page.ctx.fillText(tl, PAD_X, y);
        y += 62;
      }

      // Subtitle
      if (includeSubtitle && w.subtitle?.trim()) {
        y += 4;
        page.ctx.fillStyle = palette.muted;
        page.ctx.font = `400 26px ${fontStack}`;
        const subLines = wrapLines(page.ctx, w.subtitle.trim(), CONTENT_W).slice(0, 2);
        for (const sl of subLines) {
          page.ctx.fillText(sl, PAD_X, y);
          y += 38;
        }
      }

      // Short editorial accent rule
      y += 14;
      page.ctx.fillStyle = palette.accent;
      page.ctx.fillRect(PAD_X, y, 56, 3);
      y += 34;

      if (w.type === 'photography') {
        if (w.imageData) {
          const plate = await loadCachedPdfPlate(w, w.imageData, CONTENT_W, 820);
          if (plate) {
            const { img, drawW, drawH } = plate;
            const drawX = PAD_X + Math.round((CONTENT_W - drawW) / 2);

            page.ctx.fillStyle = palette.plateBg;
            page.ctx.fillRect(drawX - 6, y - 6, drawW + 12, drawH + 12);
            page.ctx.drawImage(img, drawX, y, drawW, drawH);
            y += drawH + 34;
          }
        }

        const exifParts =
          includeExif && w.photoMeta
            ? [
                w.photoMeta.camera,
                w.photoMeta.lens,
                w.photoMeta.film,
                w.photoMeta.aperture,
                w.photoMeta.shutter,
                w.photoMeta.iso ? `ISO ${w.photoMeta.iso}` : '',
                w.photoMeta.location,
              ].filter(Boolean)
            : [];
        if (exifParts.length > 0) {
          page.ctx.fillStyle = palette.muted;
          page.ctx.font = `400 22px ${SANS_STACK}`;
          const exifLines = exportCache.getOrWrapLines(
            `${w.id}:${w.updatedAt}:exif:${CONTENT_W}`,
            () => wrapLines(page.ctx, exifParts.join(' · '), CONTENT_W)
          );
          for (const el of exifLines) {
            if (y + 34 > BOTTOM_Y) {
              page = pushNewPage(sectionTitle);
              y = TOP_Y;
              page.ctx.fillStyle = palette.muted;
              page.ctx.font = `400 22px ${SANS_STACK}`;
              page.ctx.textAlign = 'left';
              page.ctx.textBaseline = 'top';
            }
            page.ctx.fillText(el, PAD_X, y);
            y += 34;
          }
          y += 14;
        }

        if (w.content?.trim()) {
          page.ctx.fillStyle = palette.text;
          page.ctx.font = `400 28px ${fontStack}`;
          const bodyLines = exportCache.getOrWrapLines(
            `${w.id}:${w.updatedAt}:photoBody:${options.fontStyle}:${CONTENT_W}`,
            () => wrapLines(page.ctx, w.content.trim(), CONTENT_W)
          );
          for (const bl of bodyLines) {
            if (bl === '') {
              y += 24;
              continue;
            }
            if (y + 48 > BOTTOM_Y) {
              page = pushNewPage(sectionTitle);
              y = TOP_Y;
              page.ctx.fillStyle = palette.text;
              page.ctx.font = `400 28px ${fontStack}`;
              page.ctx.textAlign = 'left';
              page.ctx.textBaseline = 'top';
            }
            page.ctx.fillText(bl, PAD_X, y);
            y += 48;
          }
        }
      } else if (
        w.writingGenre === '章節小說' &&
        Array.isArray(w.chapters) &&
        w.chapters.length > 0
      ) {
        for (let cIdx = 0; cIdx < w.chapters.length; cIdx++) {
          const ch = w.chapters[cIdx];
          if (cIdx > 0) {
            page = pushNewPage(`${w.title} · ${ch.title}`);
            y = TOP_Y;
          }

          page.ctx.textAlign = 'left';
          page.ctx.textBaseline = 'top';
          page.ctx.fillStyle = palette.muted;
          page.ctx.font = `400 21px ${SANS_STACK}`;
          page.ctx.fillText(`第 ${cIdx + 1} 章 / 共 ${w.chapters.length} 章`, PAD_X, y);
          y += 36;

          page.ctx.fillStyle = palette.text;
          page.ctx.font = `600 36px ${fontStack}`;
          const chTitleLines = wrapLines(page.ctx, ch.title, CONTENT_W);
          for (const ctl of chTitleLines) {
            page.ctx.fillText(ctl, PAD_X, y);
            y += 50;
          }
          y += 20;

          page.ctx.fillStyle = palette.text;
          page.ctx.font = `400 28px ${fontStack}`;
          const chLines = exportCache.getOrWrapLines(
            `${w.id}:${w.updatedAt}:ch:${ch.id}:${options.fontStyle}:${CONTENT_W}`,
            () => wrapLines(page.ctx, ch.content, CONTENT_W)
          );
          for (const cl of chLines) {
            if (cl === '') {
              y += 24;
              continue;
            }
            if (y + 50 > BOTTOM_Y) {
              page = pushNewPage(`${w.title} · ${ch.title}`);
              y = TOP_Y;
              page.ctx.fillStyle = palette.text;
              page.ctx.font = `400 28px ${fontStack}`;
              page.ctx.textAlign = 'left';
              page.ctx.textBaseline = 'top';
            }
            page.ctx.fillText(cl, PAD_X, y);
            y += 50;
          }
        }
      } else if (w.content?.trim()) {
        page.ctx.fillStyle = palette.text;
        page.ctx.font = `400 28px ${fontStack}`;
        const bodyLines = exportCache.getOrWrapLines(
          `${w.id}:${w.updatedAt}:writingBody:${options.fontStyle}:${CONTENT_W}`,
          () => wrapLines(page.ctx, w.content.trim(), CONTENT_W)
        );
        for (const bl of bodyLines) {
          if (bl === '') {
            y += 24;
            continue;
          }
          if (y + 50 > BOTTOM_Y) {
            page = pushNewPage(sectionTitle);
            y = TOP_Y;
            page.ctx.fillStyle = palette.text;
            page.ctx.font = `400 28px ${fontStack}`;
            page.ctx.textAlign = 'left';
            page.ctx.textBaseline = 'top';
          }
          page.ctx.fillText(bl, PAD_X, y);
          y += 50;
        }
      }

      if (includeTags && w.tags.length > 0) {
        y += 24;
        page.ctx.textAlign = 'left';
        page.ctx.textBaseline = 'top';
        page.ctx.fillStyle = palette.muted;
        page.ctx.font = `400 21px ${SANS_STACK}`;
        const tagLines = wrapLines(
          page.ctx,
          w.tags.map((t) => `#${t}`).join('  '),
          CONTENT_W
        );
        for (const tl of tagLines) {
          if (y + 34 > BOTTOM_Y) {
            page = pushNewPage(sectionTitle);
            y = TOP_Y;
            page.ctx.textAlign = 'left';
            page.ctx.textBaseline = 'top';
            page.ctx.fillStyle = palette.muted;
            page.ctx.font = `400 21px ${SANS_STACK}`;
          }
          page.ctx.fillText(tl, PAD_X, y);
          y += 32;
        }
      }
        }
      }
    }

    flushCurrentPage();
  } finally {
    // Ensure even on early error no dangling canvas bitmap stays allocated
    if (currentPage) {
      (currentPage as RenderedPage).canvas.width = 0;
      (currentPage as RenderedPage).canvas.height = 0;
      currentPage = null;
    }
  }

  let tocDataUrls: string[] = [];
  if (options.includeToc) {
    const tocEntries: TocEntry[] = tocBlueprints.map((item) => {
      if (item.kind === 'group') {
        return {
          kind: 'group',
          title: item.title,
          meta: `${item.count} 件`,
          pageNumber: contentStartPageNum + item.startIdx,
        };
      }
      if (item.kind === 'subgroup') {
        return {
          kind: 'subgroup',
          title: item.title,
          meta: `${item.count} 件`,
          pageNumber: contentStartPageNum + item.startIdx,
        };
      }
      const tocMetaParts = [
        includeGenre
          ? item.work.type === 'photography'
            ? '攝影'
            : item.work.writingGenre || '文字'
          : '',
        includeCollection
          ? item.work.category
            ? `${item.colName} / ${item.work.category}`
            : item.colName
          : '',
        includeDate ? item.work.createdAt : '',
      ].filter(Boolean);
      return {
        kind: 'work',
        numLabel: String(item.workNum).padStart(2, '0'),
        title: item.work.title,
        meta: tocMetaParts.join(' · '),
        pageNumber: contentStartPageNum + item.startIdx,
      };
    });

    tocDataUrls = renderTocPages(
      palette,
      fontStack,
      options.bookTitle,
      tocEntries,
      coverCount + 1
    );
  }

  const allPageDataUrls: string[] = [];
  if (options.includeCover) {
    allPageDataUrls.push(
      encodeAndReleaseCanvas(renderCoverPage(palette, fontStack, options, usableWorks.length))
    );
  }
  allPageDataUrls.push(...tocDataUrls);
  allPageDataUrls.push(...contentDataUrls);
  contentDataUrls.length = 0;
  const totalPageCount = allPageDataUrls.length;

  options.onProgress?.(`正在封裝 PDF（共 ${totalPageCount} 頁）...`, 85);
  await yieldStep();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: options.pageSize,
    compress: true,
  });

  const pdfW = doc.internal.pageSize.getWidth();
  const pdfH = doc.internal.pageSize.getHeight();

  for (let i = 0; i < totalPageCount; i++) {
    if (i > 0) doc.addPage(options.pageSize, 'portrait');
    doc.addImage(allPageDataUrls[i], 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
    allPageDataUrls[i] = '';
    if (i % 2 === 0 || i === totalPageCount - 1) {
      const pct = 85 + Math.round(((i + 1) / totalPageCount) * 12);
      options.onProgress?.(`正在寫入頁面 (${i + 1}/${totalPageCount})...`, pct);
      await yieldStep();
    }
  }

  const safeTitle = (options.bookTitle || 'folio_ebook')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 32);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${safeTitle}_${stamp}.pdf`;

  if (Capacitor.isNativePlatform()) {
    try {
      try {
        const perm = await Filesystem.checkPermissions();
        if (perm.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
        }
      } catch {
        // Ignore on newer Android scoped storage
      }
      const dataUri = doc.output('datauristring');
      const base64Pdf = dataUri.split(',')[1];
      if (!base64Pdf) {
        throw new Error('PDF 編碼輸出為空，無法儲存。');
      }
      const path = `FolioBooks/${filename}`;
      await Filesystem.writeFile({
        path,
        data: base64Pdf,
        directory: Directory.Documents,
        recursive: true,
      });
      exportCache.notifyUpdated();
      const approxBytes = Math.round((base64Pdf.length * 3) / 4);
      return {
        filename,
        locationLabel: `文件/FolioBooks/${filename}`,
        byteSize: approxBytes,
        pageCount: totalPageCount,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法寫入儲存空間';
      throw new Error(`Android 檔案寫入受限：${msg}。請允許儲存權限。`);
    }
  }

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  exportCache.notifyUpdated();
  return {
    filename,
    locationLabel: `瀏覽器下載資料夾 (${filename})`,
    byteSize: blob.size,
    pageCount: totalPageCount,
  };
}
