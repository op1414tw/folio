import { useEffect, useId, useRef } from 'react';

interface BackStackEntry {
  id: string;
  onClose: () => void;
}

let backStack: BackStackEntry[] = [];
let popListenerAttached = false;
let suppressPopCount = 0;
let syncScheduled = false;

function hasSentinelState(): boolean {
  try {
    const st = window.history.state as Record<string, unknown> | null;
    return Boolean(st && st.__folioSentinel === true);
  } catch {
    return false;
  }
}

function runSentinelSync(): void {
  syncScheduled = false;
  if (typeof window === 'undefined') return;

  // Wait until any pending history.back() popstate finishes settling
  if (suppressPopCount > 0) return;

  const hasSentinel = hasSentinelState();
  if (backStack.length > 0) {
    if (!hasSentinel) {
      try {
        const base =
          window.history.state && typeof window.history.state === 'object'
            ? window.history.state
            : {};
        window.history.pushState({ ...base, __folioSentinel: true }, '');
      } catch {
        // Ignore restricted history API contexts
      }
    }
  } else if (hasSentinel) {
    suppressPopCount += 1;
    try {
      window.history.back();
    } catch {
      suppressPopCount = Math.max(0, suppressPopCount - 1);
    }
  }
}

function scheduleSentinelSync(): void {
  if (syncScheduled || typeof window === 'undefined') return;
  syncScheduled = true;
  queueMicrotask(runSentinelSync);
}

function handleWindowPopState(): void {
  if (suppressPopCount > 0) {
    suppressPopCount -= 1;
    if (suppressPopCount === 0 && backStack.length > 0) {
      scheduleSentinelSync();
    }
    return;
  }

  if (backStack.length > 0) {
    const top = backStack[backStack.length - 1];
    backStack = backStack.slice(0, -1);
    try {
      top.onClose();
    } finally {
      scheduleSentinelSync();
    }
  }
}

function ensurePopListener(): void {
  if (popListenerAttached || typeof window === 'undefined') return;
  window.addEventListener('popstate', handleWindowPopState);
  popListenerAttached = true;
}

/**
 * Registers an active secondary screen/modal/subpage onto the LIFO back stack so that
 * system Back ("上一頁" / Android hardware back) closes only the topmost layer instead of
 * exiting the application.
 */
export function useBackHandler(active: boolean, onBack?: () => void): void {
  const id = useId();
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active || !onBackRef.current) return;
    ensurePopListener();

    const entryId = `${id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: BackStackEntry = {
      id: entryId,
      onClose: () => onBackRef.current?.(),
    };

    backStack = [...backStack, entry];
    scheduleSentinelSync();

    return () => {
      const idx = backStack.findIndex((item) => item.id === entryId);
      if (idx !== -1) {
        backStack = [...backStack.slice(0, idx), ...backStack.slice(idx + 1)];
        scheduleSentinelSync();
      }
    };
  }, [active, id]);
}
