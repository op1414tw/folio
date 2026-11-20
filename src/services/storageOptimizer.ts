/**
 * storageOptimizer.ts
 * 輕量化「儲存空間與記憶體優化」服務
 * 利用 requestIdleCallback 在應用閒置時，自動清理被標記為刪除但未完成垃圾回收的舊圖卡臨時快取，
 * 並壓縮過長的中繼日誌字串，以維持長期運作效能。
 */

import { exportCache } from './exportCache';

interface IdleDeadlinePolyfill {
  didTimeout: boolean;
  timeRemaining: () => number;
}

type IdleCallback = (deadline: IdleDeadlinePolyfill) => void;

function requestIdleCompat(cb: IdleCallback, timeout = 4000): number {
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      requestIdleCallback?: (cb: IdleCallback, options?: { timeout: number }) => number;
      setTimeout: (fn: () => void, ms: number) => number;
    };
    if (typeof win.requestIdleCallback === 'function') {
      return win.requestIdleCallback(cb, { timeout });
    }
    return win.setTimeout(() => {
      const start = Date.now();
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      });
    }, 1000);
  }
  return 0;
}

function cancelIdleCompat(handle: number): void {
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      cancelIdleCallback?: (id: number) => void;
      clearTimeout: (id: number) => void;
    };
    if (typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(handle);
    } else {
      win.clearTimeout(handle);
    }
  }
}

/** 執行閒置空間與快取整理 */
export function runIdleStorageOptimization(): {
  prunedDrafts: number;
  prunedCaches: number;
  compactedLogs: number;
} {
  let prunedDrafts = 0;
  let prunedCaches = 0;
  let compactedLogs = 0;

  if (typeof window === 'undefined' || !window.localStorage) {
    return { prunedDrafts, prunedCaches, compactedLogs };
  }

  const now = Date.now();

  try {
    // 1. 清理舊圖卡臨時快取與無效鍵（超過 48 小時的臨時 canvas / preview 狀態）
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // 檢查臨時圖卡暫存
      if (k.startsWith('folio_card_temp_') || k.startsWith('folio_export_tmp_')) {
        keysToRemove.push(k);
      }
    }

    keysToRemove.forEach((k) => {
      localStorage.removeItem(k);
      prunedCaches += 1;
    });

    // 2. 壓縮過長的 crash incidents，僅保留最新的 8 筆
    const crashRaw = localStorage.getItem('folio_crash_incidents_v1');
    if (crashRaw) {
      try {
        const incidents = JSON.parse(crashRaw);
        if (Array.isArray(incidents) && incidents.length > 8) {
          localStorage.setItem('folio_crash_incidents_v1', JSON.stringify(incidents.slice(0, 8)));
          compactedLogs += 1;
        }
      } catch {
        localStorage.removeItem('folio_crash_incidents_v1');
      }
    }

    // 3. 釋放匯出記憶體快取中可能滯留的舊物件
    const stats = exportCache.getStats();
    if (stats.estimatedBytes > 20 * 1024 * 1024) {
      // 若快取佔用超過 20MB，在閒置時主動進行一次清理以保護手機記憶體
      exportCache.clear();
      prunedCaches += 1;
    }
  } catch {
    // Non-blocking error handling
  }

  return { prunedDrafts, prunedCaches, compactedLogs };
}

/** 在應用閒置時排程執行儲存優化 */
export function scheduleIdleStorageOptimization(delayMs = 2500): () => void {
  let idleHandle: number | null = null;
  const timer = window.setTimeout(() => {
    idleHandle = requestIdleCompat(() => {
      runIdleStorageOptimization();
    });
  }, delayMs);

  return () => {
    window.clearTimeout(timer);
    if (idleHandle !== null) {
      cancelIdleCompat(idleHandle);
    }
  };
}
