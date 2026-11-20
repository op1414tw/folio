/**
 * resourceIntegrity.ts
 * 全域資源完整性監控與自愈機制（Silent Resource Integrity Check & Auto-Repair）
 * 100% 離線運作，靜默掃描 IndexedDB 作品資料，修復損毀 Base64、章節缺失欄位與孤立髒資料。
 */

import { saveWorksBatch } from './storage';
import { Collection, NovelChapter, WorkItem } from '../types';

export interface IntegrityCheckResult {
  inspectedCount: number;
  repairedCount: number;
  fixedIssues: string[];
}

const BASE64_DATAURL_HEADER_REGEX = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i;
const DRAFT_PREFIX = 'folio_work_editor_draft_';
const MAX_DRAFT_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** 驗證單一圖片字串的結構完整性（支援離線本機打包資源路徑與 Base64 DataURL） */
function isValidImageData(data?: string): boolean {
  if (!data) return true;
  // 本機 Vite/PWA 靜態打包路徑（如 ./assets/...、/src/assets/...）
  if (
    data.startsWith('./') ||
    data.startsWith('/assets/') ||
    data.startsWith('/src/assets/') ||
    data.startsWith('assets/')
  ) {
    return data.length > 4 && !/[\r\n]/.test(data);
  }
  if (!data.startsWith('data:image/')) return false;
  if (!BASE64_DATAURL_HEADER_REGEX.test(data)) return false;
  // 檢驗 Base64 本體長度是否過短（例如被截斷的 header）
  const commaIdx = data.indexOf(',');
  if (commaIdx === -1) return false;
  const payload = data.slice(commaIdx + 1);
  return payload.length >= 64;
}

/** 靜默檢查與修復作品資料庫完整性 */
export async function auditAndRepairResourceIntegrity(
  works: WorkItem[],
  collections: Collection[]
): Promise<{ result: IntegrityCheckResult; repairedWorks: WorkItem[] }> {
  const result: IntegrityCheckResult = {
    inspectedCount: works.length,
    repairedCount: 0,
    fixedIssues: [],
  };

  const validColIds = new Set(collections.map((c) => c.id));
  const updatedWorks: WorkItem[] = [];
  let hasModifications = false;

  for (let i = 0; i < works.length; i++) {
    const original = works[i];
    let modified = false;
    const workCopy: WorkItem = { ...original };

    // 1. 檢查並修復孤立作品集關聯（保留空字串 '' 代表「未分類」）
    if (workCopy.collectionId && !validColIds.has(workCopy.collectionId)) {
      workCopy.collectionId = '';
      workCopy.category = undefined;
      modified = true;
      result.fixedIssues.push(`作品「${workCopy.title}」之作品集不存在，已安全歸入未分類`);
    }

    // 2. 檢測攝影作品 Base64 數據損毀或截斷
    if (workCopy.type === 'photography' && workCopy.imageData) {
      if (!isValidImageData(workCopy.imageData)) {
        // 偵測到損毀或異常截斷字串，移除損毀數據以避免 Canvas / PDF 導出時發生 OOM 或拋錯
        delete workCopy.imageData;
        modified = true;
        result.fixedIssues.push(`作品「${workCopy.title}」之圖像數據格式異常截斷，已安全清理`);
      }
    }

    // 3. 檢測章節小說之章節結構完整性
    if (workCopy.type === 'writing' && workCopy.writingGenre === '章節小說') {
      if (Array.isArray(workCopy.chapters) && workCopy.chapters.length > 0) {
        const repairedChapters: NovelChapter[] = [];
        const seenChapterIds = new Set<string>();
        let chaptersModified = false;

        for (let chIdx = 0; chIdx < workCopy.chapters.length; chIdx++) {
          const ch = workCopy.chapters[chIdx];
          let chModified = false;
          let safeId = ch.id;

          if (!safeId || seenChapterIds.has(safeId)) {
            safeId = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${chIdx}`;
            chModified = true;
          }
          seenChapterIds.add(safeId);

          const safeTitle = typeof ch.title === 'string' && ch.title.trim()
            ? ch.title.trim()
            : `第 ${chIdx + 1} 章`;
          if (safeTitle !== ch.title) {
            chModified = true;
          }

          const safeContent = typeof ch.content === 'string' ? ch.content : '';
          if (safeContent !== ch.content) {
            chModified = true;
          }

          if (chModified) {
            chaptersModified = true;
            modified = true;
          }

          repairedChapters.push({
            id: safeId,
            title: safeTitle,
            content: safeContent,
          });
        }

        if (chaptersModified) {
          workCopy.chapters = repairedChapters;
          result.fixedIssues.push(`作品「${workCopy.title}」之章節結構已自動校驗補正`);
        }
      }
    }

    // 4. 確保標籤陣列存在且無空白或重複項
    if (!Array.isArray(workCopy.tags)) {
      workCopy.tags = [];
      modified = true;
    } else {
      const sanitizedTags = Array.from(
        new Set(workCopy.tags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean))
      );
      if (sanitizedTags.length !== workCopy.tags.length) {
        workCopy.tags = sanitizedTags;
        modified = true;
      }
    }

    if (modified) {
      workCopy.updatedAt = Date.now();
      result.repairedCount += 1;
      hasModifications = true;
      updatedWorks.push(workCopy);
    } else {
      updatedWorks.push(original);
    }
  }

  // 5. 清理過期或無效的草稿（先蒐集鍵名再逐一移除，避免遍歷時索引位移）
  try {
    const now = Date.now();
    const draftKeys: string[] = [];
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k);
      if (key && key.startsWith(DRAFT_PREFIX)) {
        draftKeys.push(key);
      }
    }
    for (const key of draftKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const savedAt =
            typeof parsed.savedAt === 'number'
              ? parsed.savedAt
              : typeof parsed.timestamp === 'number'
              ? parsed.timestamp
              : 0;
          if (savedAt > 0 && now - savedAt > MAX_DRAFT_AGE_MS) {
            localStorage.removeItem(key);
            result.fixedIssues.push(`清理逾期（>14天）之編輯草稿：${key}`);
          }
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage quota
  }

  // 若有修復資料，寫回 IndexedDB 確保長期穩定性
  if (hasModifications) {
    try {
      await saveWorksBatch(updatedWorks);
    } catch {
      // Non-blocking
    }
  }

  return { result, repairedWorks: updatedWorks };
}
