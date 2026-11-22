export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;
export const PIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const PIN_MAX_FAILED_ATTEMPTS = 5;
export const PIN_LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const STORAGE_KEY = 'folio_pin_attempt_state_v1';

interface StoredAttemptState {
  failedTimestamps: number[];
  lockedUntil: number | null;
}

export interface PinAttemptSnapshot {
  failedCount: number;
  remainingAttempts: number;
  lockedUntil: number | null;
  remainingLockMs: number;
  isLockedOut: boolean;
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

function readRawState(): StoredAttemptState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { failedTimestamps: [], lockedUntil: null };
    const parsed = JSON.parse(raw) as Partial<StoredAttemptState>;
    const failedTimestamps = Array.isArray(parsed.failedTimestamps)
      ? parsed.failedTimestamps.filter(
          (ts): ts is number => typeof ts === 'number' && Number.isFinite(ts)
        )
      : [];
    const lockedUntil =
      typeof parsed.lockedUntil === 'number' && Number.isFinite(parsed.lockedUntil)
        ? parsed.lockedUntil
        : null;
    return { failedTimestamps, lockedUntil };
  } catch {
    return { failedTimestamps: [], lockedUntil: null };
  }
}

function writeRawState(state: StoredAttemptState): void {
  try {
    if (state.failedTimestamps.length === 0 && state.lockedUntil === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage access errors
  }
}

export function readPinAttemptState(now = Date.now()): PinAttemptSnapshot {
  const raw = readRawState();

  if (raw.lockedUntil !== null) {
    // Guard against system clock jumping far backwards
    const clampedUntil = Math.min(raw.lockedUntil, now + PIN_LOCKOUT_DURATION_MS + 5000);
    if (now < clampedUntil) {
      if (clampedUntil !== raw.lockedUntil) {
        writeRawState({ failedTimestamps: [], lockedUntil: clampedUntil });
      }
      return {
        failedCount: PIN_MAX_FAILED_ATTEMPTS,
        remainingAttempts: 0,
        lockedUntil: clampedUntil,
        remainingLockMs: clampedUntil - now,
        isLockedOut: true,
      };
    }
    // Lockout window elapsed -> reset attempts
    writeRawState({ failedTimestamps: [], lockedUntil: null });
    return {
      failedCount: 0,
      remainingAttempts: PIN_MAX_FAILED_ATTEMPTS,
      lockedUntil: null,
      remainingLockMs: 0,
      isLockedOut: false,
    };
  }

  const pruned = raw.failedTimestamps.filter(
    (ts) => ts <= now && now - ts < PIN_ATTEMPT_WINDOW_MS
  );
  if (pruned.length !== raw.failedTimestamps.length) {
    writeRawState({ failedTimestamps: pruned, lockedUntil: null });
  }

  const failedCount = pruned.length;
  return {
    failedCount,
    remainingAttempts: Math.max(0, PIN_MAX_FAILED_ATTEMPTS - failedCount),
    lockedUntil: null,
    remainingLockMs: 0,
    isLockedOut: false,
  };
}

export function recordFailedPinAttempt(now = Date.now()): PinAttemptSnapshot {
  const current = readPinAttemptState(now);
  if (current.isLockedOut) {
    return current;
  }

  const raw = readRawState();
  const recent = raw.failedTimestamps.filter(
    (ts) => ts <= now && now - ts < PIN_ATTEMPT_WINDOW_MS
  );
  const next = [...recent, now];

  if (next.length >= PIN_MAX_FAILED_ATTEMPTS) {
    const lockedUntil = now + PIN_LOCKOUT_DURATION_MS;
    writeRawState({ failedTimestamps: [], lockedUntil });
    return {
      failedCount: PIN_MAX_FAILED_ATTEMPTS,
      remainingAttempts: 0,
      lockedUntil,
      remainingLockMs: PIN_LOCKOUT_DURATION_MS,
      isLockedOut: true,
    };
  }

  writeRawState({ failedTimestamps: next, lockedUntil: null });
  return {
    failedCount: next.length,
    remainingAttempts: Math.max(0, PIN_MAX_FAILED_ATTEMPTS - next.length),
    lockedUntil: null,
    remainingLockMs: 0,
    isLockedOut: false,
  };
}

export function clearPinAttempts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export function formatLockoutCountdown(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
