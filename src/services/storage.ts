import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import JSZip from 'jszip';
import {
  AppSettings,
  BackupArchive,
  Collection,
  ScheduledBackupFrequency,
  WorkItem,
} from '../types';
import { exportCache } from './exportCache';

async function ensureNativeDocumentsWritePermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage !== 'granted') {
      await Filesystem.requestPermissions();
    }
  } catch {
    // Scoped storage on modern Android may not require runtime publicStorage prompt; writeFile will verify access
  }
}

const DB_NAME = 'folio_archive_db';
const DB_VERSION = 1;
const STORE_WORKS = 'works';
const STORE_COLLECTIONS = 'collections';
const SETTINGS_KEY = 'folio_app_settings_v1';
const SEEDED_KEY = 'folio_seeded_v1';

export const DEFAULT_PRESET_TAGS = [
  '日常',
  '底片',
  '街拍',
  '散文',
  '現代詩',
  '夜色',
  '自然',
  '人物',
  '旅行',
  '靈感',
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  layout: 'masonry',
  brandTitle: '拾光卷宗',
  authorName: '林硯',
  sealText: '硯',
  presetTags: DEFAULT_PRESET_TAGS,
  customTags: ['藍調時刻', '書桌'],
  defaultCollectionId: '',
  defaultNewWorkType: 'photography',
  defaultUntitledTitle: '無題',
  defaultMarkdownEnabled: true,
  savedShareTemplates: [],
  defaultShareTemplateId: '',
  requireLockOnLaunch: false,
  hasPin: false,
  hasSeenWelcome: false,
  devOptionsEnabled: false,
  addButtonPosition: 'fab-right',
  swipeTabNavigationEnabled: true,
  conciseCopyMode: false,
  minimalMode: false,
  animationOverhaul: false,
  scheduledBackupFrequency: 'off',
  scheduledBackupFormat: 'json',
  scheduledBackupAskBeforeRun: true,
  scheduledBackupHour: 20,
  scheduledBackupMinute: 0,
  scheduledBackupWeekday: 0,
  scheduledBackupMonthDay: 1,
  scheduledBackupMonth: 1,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_WORKS)) {
        db.createObjectStore(STORE_WORKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_COLLECTIONS)) {
        db.createObjectStore(STORE_COLLECTIONS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

export async function getAllWorks(): Promise<WorkItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, 'readonly');
    const store = tx.objectStore(STORE_WORKS);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as WorkItem[]) || [];
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveWork(work: WorkItem): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, 'readwrite');
    tx.objectStore(STORE_WORKS).put(work);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveWorksBatch(works: WorkItem[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, 'readwrite');
    const store = tx.objectStore(STORE_WORKS);
    for (const work of works) {
      store.put(work);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteWork(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, 'readwrite');
    tx.objectStore(STORE_WORKS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteWorksBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, 'readwrite');
    const store = tx.objectStore(STORE_WORKS);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearWorks(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, 'readwrite');
    tx.objectStore(STORE_WORKS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllCollections(): Promise<Collection[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLLECTIONS, 'readonly');
    const req = tx.objectStore(STORE_COLLECTIONS).getAll();
    req.onsuccess = () => {
      const items = (req.result as Collection[]) || [];
      items.sort((a, b) => {
        const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt - b.createdAt;
      });
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCollection(col: Collection): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLLECTIONS, 'readwrite');
    tx.objectStore(STORE_COLLECTIONS).put(col);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveCollectionsBatch(cols: Collection[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLLECTIONS, 'readwrite');
    const store = tx.objectStore(STORE_COLLECTIONS);
    for (const c of cols) {
      store.put(c);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLLECTIONS, 'readwrite');
    tx.objectStore(STORE_COLLECTIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearCollections(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLLECTIONS, 'readwrite');
    tx.objectStore(STORE_COLLECTIONS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const { value } = await Preferences.get({ key: SETTINGS_KEY });
    if (value) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
    }
  } catch {
    // Ignore Preferences error or corrupted JSON and fall back to localStorage
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore corrupted localStorage JSON and fall back cleanly to defaults
  }
  return DEFAULT_SETTINGS;
}

let settingsWriteChain: Promise<void> = Promise.resolve();

export function saveSettings(settings: AppSettings): Promise<void> {
  const serialized = JSON.stringify(settings);
  const runWrite = async () => {
    try {
      await Preferences.set({ key: SETTINGS_KEY, value: serialized });
    } catch {
      // Fallback
    }
    try {
      localStorage.setItem(SETTINGS_KEY, serialized);
    } catch {
      // Ignore storage quota issues
    }
  };
  settingsWriteChain = settingsWriteChain.then(runWrite, runWrite);
  return settingsWriteChain;
}

export async function checkIsSeeded(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: SEEDED_KEY });
    if (value === 'true') return true;
  } catch {
    // ignore
  }
  return localStorage.getItem(SEEDED_KEY) === 'true';
}

export async function markSeeded(): Promise<void> {
  try {
    await Preferences.set({ key: SEEDED_KEY, value: 'true' });
  } catch {
    // ignore
  }
  localStorage.setItem(SEEDED_KEY, 'true');
}

/**
 * Convert local bundled asset URLs to self-contained DataURLs for 100% portable offline backups
 * (Uses bounded LRU memory cache to skip redundant canvas re-encoding on repeated exports)
 */
async function convertImageUrlToDataUrlUncached(src: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(src);
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export async function resolveImageToDataUrl(src?: string): Promise<string | undefined> {
  return exportCache.resolveImageCached(src, convertImageUrlToDataUrlUncached);
}

function sanitizePathSegment(name: string, fallback = '未命名'): string {
  const cleaned = (name || fallback)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .trim();
  return cleaned || fallback;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
}

function buildOfflineHtmlCatalog(
  works: WorkItem[],
  collections: Collection[],
  authorName: string,
  exportedAt: string
): string {
  const colMap = new Map(collections.map((c) => [c.id, c.name]));
  const publicWorks = works.filter((w) => !(w.isPrivate && w.isSealed));

  const cardsHtml = publicWorks
    .map((w) => {
      const colName = colMap.get(w.collectionId) || '未分類';
      const prepared = exportCache.getOrBuildPreparedWork(w, colName);
      const imageHtml =
        w.type === 'photography' && w.imageData
          ? `<img src="${w.imageData}" alt="${escapeHtml(w.title)}" />`
          : '';

      return `
      <article class="card">
        ${prepared.htmlMetaHtml}
        ${imageHtml}
        ${prepared.htmlBodyHtml}
        ${prepared.htmlExifHtml}
        ${prepared.htmlTagsHtml}
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(authorName)} — 拾光卷宗離線典藏目錄</title>
<style>
  body { margin: 0; padding: 32px 20px; background: #F7F6F2; color: #1C1917; font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif; line-height: 1.75; }
  .wrap { max-width: 820px; margin: 0 auto; }
  header { border-bottom: 1px solid #E2DFD7; padding-bottom: 18px; margin-bottom: 28px; }
  h1 { font-family: Georgia, "Noto Serif TC", "PMingLiU", serif; margin: 0 0 6px; font-size: 28px; }
  .lead { color: #78716C; font-size: 13px; margin: 0; }
  .card { background: #FFFFFF; border: 1px solid #E7E4DC; border-radius: 14px; padding: 24px; margin-bottom: 20px; }
  .meta { font-size: 12px; color: #78716C; margin-bottom: 6px; }
  h2 { font-family: Georgia, "Noto Serif TC", serif; font-size: 22px; margin: 0 0 8px; }
  .sub { font-size: 14px; color: #57534E; margin: 0 0 12px; }
  img { width: 100%; max-height: 520px; object-fit: contain; border-radius: 8px; background: #F0EFEA; margin: 12px 0; }
  .body { font-size: 15px; color: #292524; margin-top: 10px; }
  .exif { font-size: 12px; color: #57534E; border-top: 1px solid #F0EDE6; padding-top: 10px; margin-top: 14px; }
  .tags { font-size: 12px; color: #78716C; margin-top: 8px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(authorName)} 的拾光卷宗典藏</h1>
      <p class="lead">匯出時間：${escapeHtml(new Date(exportedAt).toLocaleString('zh-TW'))} · 共 ${publicWorks.length} 件可瀏覽作品</p>
    </header>
    ${cardsHtml || '<p>尚無公開作品。</p>'}
  </div>
</body>
</html>`;
}

export interface ScheduledBackupTimeConfig {
  hour?: number;
  minute?: number;
  weekday?: number; // 0 = Sun .. 6 = Sat
  monthDay?: number; // 1..31
  month?: number; // 1..12
}

function getDaysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

export function computeNextScheduledBackupAt(
  frequency: ScheduledBackupFrequency,
  fromMs = Date.now(),
  schedule?: ScheduledBackupTimeConfig
): number | undefined {
  if (frequency === 'off') return undefined;

  const hour = Math.min(23, Math.max(0, Math.floor(schedule?.hour ?? 20)));
  const minute = Math.min(59, Math.max(0, Math.floor(schedule?.minute ?? 0)));
  const weekday = Math.min(6, Math.max(0, Math.floor(schedule?.weekday ?? 0)));
  const monthDay = Math.min(31, Math.max(1, Math.floor(schedule?.monthDay ?? 1)));
  const month = Math.min(12, Math.max(1, Math.floor(schedule?.month ?? 1)));

  const now = new Date(fromMs);

  if (frequency === 'daily') {
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );
    if (candidate.getTime() <= fromMs) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  }

  if (frequency === 'weekly') {
    const diffDays = (weekday - now.getDay() + 7) % 7;
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + diffDays,
      hour,
      minute,
      0,
      0
    );
    if (candidate.getTime() <= fromMs) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate.getTime();
  }

  if (frequency === 'monthly') {
    let year = now.getFullYear();
    let month0 = now.getMonth();
    let day = Math.min(monthDay, getDaysInMonth(year, month0));
    let candidate = new Date(year, month0, day, hour, minute, 0, 0);
    if (candidate.getTime() <= fromMs) {
      month0 += 1;
      if (month0 > 11) {
        month0 = 0;
        year += 1;
      }
      day = Math.min(monthDay, getDaysInMonth(year, month0));
      candidate = new Date(year, month0, day, hour, minute, 0, 0);
    }
    return candidate.getTime();
  }

  // yearly
  let year = now.getFullYear();
  const targetMonth0 = month - 1;
  let day = Math.min(monthDay, getDaysInMonth(year, targetMonth0));
  let candidate = new Date(year, targetMonth0, day, hour, minute, 0, 0);
  if (candidate.getTime() <= fromMs) {
    year += 1;
    day = Math.min(monthDay, getDaysInMonth(year, targetMonth0));
    candidate = new Date(year, targetMonth0, day, hour, minute, 0, 0);
  }
  return candidate.getTime();
}

const HANDLE_DB_NAME = 'folio_backup_handles_db';
const HANDLE_STORE_NAME = 'handles';
const FIXED_DIR_KEY = 'fixed_backup_dir';

interface BrowserDirHandleLike {
  name: string;
  queryPermission?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  getFileHandle: (
    name: string,
    opts?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export function isDirectoryPickerSupported(): boolean {
  return (
    !Capacitor.isNativePlatform() &&
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSavedDirHandle(): Promise<BrowserDirHandleLike | null> {
  try {
    const db = await openHandleDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
      const req = tx.objectStore(HANDLE_STORE_NAME).get(FIXED_DIR_KEY);
      req.onsuccess = () => resolve((req.result as BrowserDirHandleLike) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeSavedDirHandle(handle: BrowserDirHandleLike | null): Promise<void> {
  try {
    const db = await openHandleDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HANDLE_STORE_NAME);
      if (handle) {
        store.put(handle, FIXED_DIR_KEY);
      } else {
        store.delete(FIXED_DIR_KEY);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage handle persistence failures
  }
}

export async function pickFixedBackupDirectory(): Promise<{ name: string } | null> {
  if (!isDirectoryPickerSupported()) return null;
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<BrowserDirHandleLike>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  if (!handle) return null;
  if (handle.requestPermission) {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return null;
  }
  await writeSavedDirHandle(handle);
  return { name: handle.name };
}

export async function getFixedBackupDirectoryName(): Promise<string | null> {
  const handle = await readSavedDirHandle();
  return handle?.name || null;
}

export async function clearFixedBackupDirectory(): Promise<void> {
  await writeSavedDirHandle(null);
}

async function tryWriteToFixedDirectory(
  filename: string,
  data: Blob | string
): Promise<string | null> {
  try {
    const handle = await readSavedDirHandle();
    if (!handle) return null;
    if (handle.queryPermission) {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
    }
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return handle.name;
  } catch {
    return null;
  }
}

export interface BackupExportOptions {
  onProgress?: (label: string, percent: number) => void;
  yieldHook?: () => Promise<void>;
  preferFixedFolder?: boolean;
}

const defaultYield = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportCrossPlatformZipBackup(
  works: WorkItem[],
  collections: Collection[],
  authorName: string,
  options?: BackupExportOptions
): Promise<{ filename: string; locationLabel: string; byteSize: number }> {
  const yieldStep = options?.yieldHook || defaultYield;
  const total = Math.max(1, works.length);

  options?.onProgress?.('正在讀取作品影像與資料...', 3);
  const resolvedWorks: WorkItem[] = [];
  for (let i = 0; i < works.length; i++) {
    const w = works[i];
    if (w.imageData && !w.imageData.startsWith('data:')) {
      const dataUrl = await resolveImageToDataUrl(w.imageData);
      resolvedWorks.push({ ...w, imageData: dataUrl });
    } else {
      resolvedWorks.push(w);
    }
    const pct = 4 + Math.round(((i + 1) / total) * 30);
    options?.onProgress?.(`正在整理影像資源 (${i + 1}/${works.length})...`, pct);
    await yieldStep();
  }

  const exportedAt = new Date().toISOString();
  const archive: BackupArchive = {
    format: 'folio-archive-v1',
    exportedAt,
    authorName,
    collections,
    works: resolvedWorks,
  };

  const zip = new JSZip();
  const colMap = new Map(collections.map((c) => [c.id, c.name]));

  // 1. Machine-readable restore manifest inside ZIP (compact JSON saves memory & zip size)
  zip.file('folio_restore_data.json', JSON.stringify(archive));

  options?.onProgress?.('正在產生離線瀏覽目錄...', 38);
  await yieldStep();

  // 2. Standalone cross-platform offline HTML viewer
  zip.file(
    '作品瀏覽目錄.html',
    buildOfflineHtmlCatalog(resolvedWorks, collections, authorName, exportedAt)
  );

  // 3. Human-readable README
  const readme = [
    `拾光卷宗 · 跨平台離線備份壓縮包`,
    `作者：${authorName}`,
    `匯出時間：${new Date(exportedAt).toLocaleString('zh-TW')}`,
    `作品總數：${resolvedWorks.length} 件（含 ${collections.length} 個作品集）`,
    ``,
    `【各平台開啟與整理方式】`,
    `1. 雙擊「作品瀏覽目錄.html」：免安裝任何軟體，即可於電腦或手機瀏覽器離線瀏覽圖文排版。`,
    `2. 開啟「作品集資料夾/」：所有非加密作品已依作品集資料夾整理，攝影為原始 JPG/PNG 檔，文字為通用 Markdown (.md) 純文字檔，方便在 Windows、macOS、Android 檔案管理員直接閱讀或歸檔。`,
    `3. 還原至 App：未來在「拾光卷宗」選擇「從備份檔還原匯入」，直接選取本 .zip 壓縮檔（或裡面的 folio_restore_data.json）即可完整還原所有標籤、EXIF 與加密資料。`,
  ].join('\n');
  zip.file('README_整理說明.txt', readme);

  // 4. Organized human-friendly folders per collection
  const folderRoot = zip.folder('作品集資料夾');
  const usedNames = new Map<string, number>();

  for (let wIdx = 0; wIdx < resolvedWorks.length; wIdx++) {
    const w = resolvedWorks[wIdx];
    if (wIdx % 3 === 0) {
      const pct = 40 + Math.round(((wIdx + 1) / total) * 20);
      options?.onProgress?.(`正在寫入作品資料夾 (${wIdx + 1}/${resolvedWorks.length})...`, pct);
      await yieldStep();
    }
    if (w.isPrivate && w.isSealed) continue; // Keep encrypted works safely inside JSON only
    const colName = sanitizePathSegment(colMap.get(w.collectionId) || '未分類');
    const colFolder = folderRoot?.folder(colName);
    if (!colFolder) continue;

    const targetFolder = w.category
      ? colFolder.folder(sanitizePathSegment(w.category)) || colFolder
      : colFolder;

    const baseTitle = sanitizePathSegment(`${w.createdAt}_${w.title}`, w.id);
    const dedupKey = `${colName}/${w.category || ''}/${baseTitle}`;
    const seq = (usedNames.get(dedupKey) || 0) + 1;
    usedNames.set(dedupKey, seq);
    const uniqueStem = seq > 1 ? `${baseTitle}_${seq}` : baseTitle;

    const prepared = exportCache.getOrBuildPreparedWork(w, colName);

    if (w.type === 'writing') {
      targetFolder.file(`${uniqueStem}.md`, prepared.markdownText);
    } else {
      if (w.imageData && w.imageData.startsWith('data:image/')) {
        const match = w.imageData.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (match) {
          const ext = match[1].toLowerCase() === 'png' ? 'png' : 'jpg';
          targetFolder.file(`${uniqueStem}.${ext}`, match[2], { base64: true });
        }
      }
      targetFolder.file(`${uniqueStem}_筆記.txt`, prepared.photoNoteText);
    }
  }

  const filename = `folio_archive_${buildStamp()}.zip`;

  options?.onProgress?.('正在壓縮打包檔案...', 62);
  await yieldStep();

  if (Capacitor.isNativePlatform()) {
    try {
      const base64Zip = await zip.generateAsync(
        { type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 5 } },
        (meta) => {
          const pct = 62 + Math.round(meta.percent * 0.34);
          options?.onProgress?.(`正在壓縮備份封包 (${Math.round(meta.percent)}%)...`, pct);
        }
      );
      options?.onProgress?.('正在寫入固定資料夾...', 97);
      await yieldStep();
      await ensureNativeDocumentsWritePermission();
      const path = `FolioBackups/${filename}`;
      await Filesystem.writeFile({
        path,
        data: base64Zip,
        directory: Directory.Documents,
        recursive: true,
      });
      const approxBytes = Math.round((base64Zip.length * 3) / 4);
      options?.onProgress?.('ZIP 備份已直接儲存完成', 100);
      return {
        filename,
        locationLabel: `文件/FolioBackups/${filename}`,
        byteSize: approxBytes,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法寫入裝置儲存空間';
      throw new Error(`Android 檔案系統權限受限：${msg}。請於系統設定中允許儲存權限。`);
    }
  }

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } },
    (meta) => {
      const pct = 62 + Math.round(meta.percent * 0.34);
      options?.onProgress?.(`正在壓縮備份封包 (${Math.round(meta.percent)}%)...`, pct);
    }
  );
  options?.onProgress?.('正在寫入備份檔案...', 97);
  await yieldStep();

  if (options?.preferFixedFolder) {
    const folderName = await tryWriteToFixedDirectory(filename, blob);
    if (folderName) {
      exportCache.notifyUpdated();
      options?.onProgress?.('ZIP 備份已儲存至指定資料夾', 100);
      return {
        filename,
        locationLabel: `指定資料夾 / ${folderName}/${filename}`,
        byteSize: blob.size,
      };
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  exportCache.notifyUpdated();
  options?.onProgress?.('ZIP 備份壓縮完成', 100);
  return {
    filename,
    locationLabel: `瀏覽器下載資料夾 (${filename})`,
    byteSize: blob.size,
  };
}

export async function exportFullBackup(
  works: WorkItem[],
  collections: Collection[],
  authorName: string,
  options?: BackupExportOptions
): Promise<{ filename: string; locationLabel: string; byteSize: number }> {
  const yieldStep = options?.yieldHook || defaultYield;
  const total = Math.max(1, works.length);

  options?.onProgress?.('正在讀取作品與影像資料...', 5);
  const resolvedWorks: WorkItem[] = [];
  for (let i = 0; i < works.length; i++) {
    const w = works[i];
    if (w.imageData && !w.imageData.startsWith('data:')) {
      const dataUrl = await resolveImageToDataUrl(w.imageData);
      resolvedWorks.push({ ...w, imageData: dataUrl });
    } else {
      resolvedWorks.push(w);
    }
    const pct = 8 + Math.round(((i + 1) / total) * 60);
    options?.onProgress?.(`正在整理 JSON 備份 (${i + 1}/${works.length})...`, pct);
    await yieldStep();
  }

  options?.onProgress?.('正在序列化 JSON 備份檔...', 78);
  await yieldStep();

  const archive: BackupArchive = {
    format: 'folio-archive-v1',
    exportedAt: new Date().toISOString(),
    authorName,
    collections,
    works: resolvedWorks,
  };

  const json = JSON.stringify(archive, null, 2);
  const filename = `folio_backup_${buildStamp()}.json`;
  const byteSize = new Blob([json]).size;
  options?.onProgress?.('正在寫入備份檔案...', 94);
  await yieldStep();

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNativeDocumentsWritePermission();
      const path = `FolioBackups/${filename}`;
      await Filesystem.writeFile({
        path,
        data: json,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      exportCache.notifyUpdated();
      return {
        filename,
        locationLabel: `文件/FolioBackups/${filename}`,
        byteSize,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法寫入裝置儲存空間';
      throw new Error(`Android 檔案系統權限受限：${msg}。請於系統設定中允許儲存權限。`);
    }
  }

  // Web / Browser offline save (prefer bound fixed folder when configured, else browser Downloads)
  if (options?.preferFixedFolder) {
    const folderName = await tryWriteToFixedDirectory(filename, json);
    if (folderName) {
      exportCache.notifyUpdated();
      return {
        filename,
        locationLabel: `指定資料夾 / ${folderName}/${filename}`,
        byteSize,
      };
    }
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  exportCache.notifyUpdated();
  return {
    filename,
    locationLabel: `瀏覽器下載資料夾 (${filename})`,
    byteSize,
  };
}

export async function saveOrShareGeneratedImage(
  dataUrl: string,
  title: string
): Promise<string> {
  const safeName = (title || 'folio_card').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 32);
  const filename = `${safeName}_${Date.now()}.png`;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNativeDocumentsWritePermission();
      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) {
        throw new Error('圖片編碼格式無效，無法寫入儲存空間。');
      }
      const path = `FolioCards/${filename}`;
      await Filesystem.writeFile({
        path,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });
      return `已直接儲存至 文件/FolioCards/${filename}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗';
      throw new Error(`儲存圖片需要檔案儲存權限：${msg}`);
    }
  }

  // Direct PNG download into browser downloads folder
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return `已直接儲存至下載資料夾 (${filename})`;
}

export async function saveOrShareMultipleImages(
  dataUrls: string[],
  title: string
): Promise<string> {
  if (dataUrls.length === 0) {
    throw new Error('沒有可輸出的圖片。');
  }
  if (dataUrls.length === 1) {
    return saveOrShareGeneratedImage(dataUrls[0], title);
  }

  const safeName = (title || 'folio_card').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 28);
  const stamp = Date.now();

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNativeDocumentsWritePermission();
      for (let i = 0; i < dataUrls.length; i++) {
        const base64Data = dataUrls[i].split(',')[1];
        if (!base64Data) {
          throw new Error(`第 ${i + 1} 頁圖片編碼無效。`);
        }
        const pageNum = String(i + 1).padStart(2, '0');
        const path = `FolioCards/${safeName}_${stamp}_${pageNum}.png`;
        await Filesystem.writeFile({
          path,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        });
      }
      return `已直接儲存全部 ${dataUrls.length} 張圖卡至 文件/FolioCards/`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗';
      throw new Error(`儲存多張圖片需要檔案儲存權限：${msg}`);
    }
  }

  for (let i = 0; i < dataUrls.length; i++) {
    const pageNum = String(i + 1).padStart(2, '0');
    const a = document.createElement('a');
    a.href = dataUrls[i];
    a.download = `${safeName}_${pageNum}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (i < dataUrls.length - 1) {
      await new Promise((r) => setTimeout(r, 220));
    }
  }

  return `已直接依序儲存全部 ${dataUrls.length} 張圖卡至下載資料夾 (${safeName}_01~${String(
    dataUrls.length
  ).padStart(2, '0')}.png)`;
}

export function validateBackupJson(rawText: string): BackupArchive {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('檔案格式錯誤：無法解析 JSON 內容。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('備份檔案結構無效。');
  }

  const candidate = parsed as Partial<BackupArchive>;
  if (candidate.format !== 'folio-archive-v1' || !Array.isArray(candidate.works)) {
    throw new Error('非有效的「拾光卷宗」備份檔格式。');
  }

  const validWorks = candidate.works.filter(
    (w): w is WorkItem =>
      Boolean(w) &&
      typeof w === 'object' &&
      typeof (w as Partial<WorkItem>).id === 'string' &&
      ((w as Partial<WorkItem>).type === 'photography' ||
        (w as Partial<WorkItem>).type === 'writing')
  );

  const validCollections = Array.isArray(candidate.collections)
    ? candidate.collections.filter(
        (c): c is Collection =>
          Boolean(c) &&
          typeof c === 'object' &&
          typeof (c as Partial<Collection>).id === 'string' &&
          typeof (c as Partial<Collection>).name === 'string'
      )
    : [];

  return {
    format: 'folio-archive-v1',
    exportedAt: candidate.exportedAt || new Date().toISOString(),
    authorName: candidate.authorName || '未署名',
    collections: validCollections,
    works: validWorks,
  };
}

export async function parseBackupFile(file: File): Promise<BackupArchive> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.zip') || file.type === 'application/zip') {
    let zip: JSZip;
    try {
      const buf = await file.arrayBuffer();
      zip = await JSZip.loadAsync(buf);
    } catch {
      throw new Error('無法開啟 ZIP 壓縮檔案。');
    }
    const manifestFile = zip.file('folio_restore_data.json');
    if (!manifestFile) {
      throw new Error('此 ZIP 壓縮包內找不到還原清單 (folio_restore_data.json)。');
    }
    const jsonText = await manifestFile.async('string');
    return validateBackupJson(jsonText);
  }

  const text = await file.text();
  return validateBackupJson(text);
}

export async function readImageFileAsDataUrl(file: File): Promise<{
  dataUrl: string;
  aspectRatio: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 2000;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const aspectRatio = h > 0 ? Number((w / h).toFixed(3)) : 1;

        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              resolve({
                dataUrl: canvas.toDataURL('image/jpeg', 0.9),
                aspectRatio,
              });
              return;
            }
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        resolve({ dataUrl: result, aspectRatio });
      };
      img.onerror = () => reject(new Error('無法讀取圖片尺寸'));
      img.src = result;
    };
    reader.onerror = () => reject(new Error('檔案讀取失敗'));
    reader.readAsDataURL(file);
  });
}
