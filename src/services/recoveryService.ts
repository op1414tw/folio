/**
 * recoveryService.ts
 * 全域錯誤記錄與自動回復機制（Safe Mode / Crash Incident Tracking）
 * 100% 離線運作，未處理異常暫存於 LocalStorage，守護用戶作品集安全。
 */

const CRASH_INCIDENTS_KEY = 'folio_crash_incidents_v1';
const CRASH_PROMPT_PENDING_KEY = 'folio_crash_prompt_pending_v1';
const SAFE_MODE_STORAGE_KEY = 'folio_safe_mode_active_v1';
const MAX_STORED_INCIDENTS = 10;

export interface CrashIncident {
  id: string;
  timestamp: number;
  timeStr: string;
  message: string;
  source?: string;
  stack?: string;
  type: 'uncaught_error' | 'unhandled_rejection' | 'react_boundary';
}

/** 讀取所有記錄的崩潰與異常事件 */
export function getCrashIncidents(): CrashIncident[] {
  try {
    const raw = localStorage.getItem(CRASH_INCIDENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 儲存單一崩潰事件至 LocalStorage */
export function recordCrashIncident(
  error: unknown,
  type: CrashIncident['type'] = 'uncaught_error',
  extraInfo?: string
): CrashIncident {
  const now = new Date();
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : '未知非預期異常';
  const stack = error instanceof Error ? error.stack : extraInfo;

  const incident: CrashIncident = {
    id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.getTime(),
    timeStr: now.toLocaleString('zh-TW', { hour12: false }),
    message: message.slice(0, 500),
    source: extraInfo?.slice(0, 300),
    stack: stack ? stack.slice(0, 1500) : undefined,
    type,
  };

  try {
    const existing = getCrashIncidents();
    const updated = [incident, ...existing].slice(0, MAX_STORED_INCIDENTS);
    localStorage.setItem(CRASH_INCIDENTS_KEY, JSON.stringify(updated));
    localStorage.setItem(CRASH_PROMPT_PENDING_KEY, 'true');
  } catch {
    // LocalStorage quota fallback
  }

  return incident;
}

/** 清除所有異常記錄 */
export function clearCrashIncidents(): void {
  try {
    localStorage.removeItem(CRASH_INCIDENTS_KEY);
    localStorage.removeItem(CRASH_PROMPT_PENDING_KEY);
  } catch {
    // Ignore
  }
}

/** 是否有待提示用戶進入安全模式的崩潰旗標 */
export function hasPendingCrashPrompt(): boolean {
  try {
    return localStorage.getItem(CRASH_PROMPT_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

/** 清除待提示旗標（用戶已選擇進入或略過安全模式） */
export function dismissPendingCrashPrompt(): void {
  try {
    localStorage.removeItem(CRASH_PROMPT_PENDING_KEY);
  } catch {
    // Ignore
  }
}

/** 檢查當前是否處於安全模式 */
export function isSafeModeActive(): boolean {
  try {
    return localStorage.getItem(SAFE_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** 設定或解除安全模式 */
export function setSafeModeActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(SAFE_MODE_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(SAFE_MODE_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

let isGlobalListenerAttached = false;

/** 初始化全域未處理異常監聽器 */
export function initGlobalErrorRecovery(): void {
  if (typeof window === 'undefined' || isGlobalListenerAttached) return;
  isGlobalListenerAttached = true;

  // 攔截未捕獲的同步/異步運行時錯誤
  window.addEventListener('error', (event) => {
    // 過濾非本應用或無害的常見瀏覽器噪音
    if (
      event.message?.includes('ResizeObserver') ||
      event.message?.includes('Script error.') ||
      event.filename?.includes('chrome-extension')
    ) {
      return;
    }

    recordCrashIncident(
      event.error || event.message,
      'uncaught_error',
      `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`
    );
  });

  // 攔截未處理的 Promise Rejection
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (
      typeof reason === 'string' &&
      (reason.includes('ResizeObserver') || reason.includes('cancelled'))
    ) {
      return;
    }
    recordCrashIncident(reason, 'unhandled_rejection');
  });
}
