import React, { useEffect, useState } from 'react';
import { Clock, Delete, Lock, RotateCcw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import {
  formatLockoutCountdown,
  isValidPinFormat,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  PinAttemptSnapshot,
  readPinAttemptState,
} from '../services/pinLockout';
import { BottomSheet } from './BottomSheet';

interface PinLockModalProps {
  isOpen: boolean;
  mode: 'unlock' | 'setup' | 'verify-disable';
  variant?: 'sheet' | 'fullscreen';
  brandTitle?: string;
  title?: string;
  subtitle?: string;
  onClose?: () => void;
  onSubmitPin: (pin: string) => Promise<boolean>;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  isOpen,
  mode,
  variant = 'sheet',
  brandTitle = '拾光卷宗',
  title,
  subtitle,
  onClose,
  onSubmitPin,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attemptState, setAttemptState] = useState<PinAttemptSnapshot>(() =>
    readPinAttemptState()
  );

  const isFullscreen = variant === 'fullscreen';
  const usesLockout = mode !== 'setup';
  const isLockedOut = usesLockout && attemptState.isLockedOut;

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setConfirmPin('');
      setStep('enter');
      setError('');
      setBusy(false);
      setAttemptState(readPinAttemptState());
    }
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen || !usesLockout || !attemptState.isLockedOut) return;
    const timer = window.setInterval(() => {
      const next = readPinAttemptState();
      setAttemptState(next);
      if (!next.isLockedOut) {
        setError('');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, usesLockout, attemptState.isLockedOut]);

  const activeValue = step === 'enter' ? pin : confirmPin;

  const handleDigit = (digit: string) => {
    if (busy || isLockedOut) return;
    setError('');

    if (step === 'enter') {
      if (pin.length >= PIN_MAX_LENGTH) return;
      setPin((prev) => prev + digit);
    } else {
      if (confirmPin.length >= PIN_MAX_LENGTH) return;
      setConfirmPin((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    if (busy || isLockedOut) return;
    setError('');
    if (step === 'enter') {
      setPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (busy || isLockedOut) return;
    setError('');
    if (step === 'enter') {
      setPin('');
    } else {
      setConfirmPin('');
    }
  };

  const handleSubmit = async () => {
    if (busy) return;

    if (usesLockout) {
      const latestLock = readPinAttemptState();
      setAttemptState(latestLock);
      if (latestLock.isLockedOut) {
        return;
      }
    }

    if (mode === 'setup') {
      if (step === 'enter') {
        if (!isValidPinFormat(pin)) {
          setError(`請輸入 ${PIN_MIN_LENGTH}～${PIN_MAX_LENGTH} 位數字密碼`);
          return;
        }
        setError('');
        setStep('confirm');
        return;
      }

      if (!isValidPinFormat(confirmPin)) {
        setError(`請輸入 ${PIN_MIN_LENGTH}～${PIN_MAX_LENGTH} 位數字密碼`);
        return;
      }

      if (confirmPin !== pin) {
        setError('兩次輸入的密碼不一致，請重新設定');
        setPin('');
        setConfirmPin('');
        setStep('enter');
        return;
      }

      setBusy(true);
      try {
        const ok = await onSubmitPin(confirmPin);
        if (!ok) {
          setError('設定失敗，請重試');
          setPin('');
          setConfirmPin('');
          setStep('enter');
        }
      } catch {
        setError('設定過程發生異常，請重試');
        setPin('');
        setConfirmPin('');
        setStep('enter');
      } finally {
        setBusy(false);
      }
      return;
    }

    // unlock / verify-disable
    if (!isValidPinFormat(pin)) {
      setError(`密碼需為 ${PIN_MIN_LENGTH}～${PIN_MAX_LENGTH} 位數字`);
      return;
    }

    setBusy(true);
    try {
      const ok = await onSubmitPin(pin);
      if (!ok) {
        const latest = readPinAttemptState();
        setAttemptState(latest);
        setPin('');
        if (latest.isLockedOut) {
          setError('');
        } else {
          setError(
            `密碼不正確（10 分鐘內剩餘 ${latest.remainingAttempts} 次嘗試機會）`
          );
        }
      } else {
        setAttemptState(readPinAttemptState());
      }
    } catch {
      setError('驗證過程發生異常，請重試');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const keyActionsRef = React.useRef({
    handleDigit,
    handleBackspace,
    handleSubmit,
    onClose,
    isFullscreen,
  });
  keyActionsRef.current = {
    handleDigit,
    handleBackspace,
    handleSubmit,
    onClose,
    isFullscreen,
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        keyActionsRef.current.handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        keyActionsRef.current.handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void keyActionsRef.current.handleSubmit();
      } else if (
        e.key === 'Escape' &&
        !keyActionsRef.current.isFullscreen &&
        keyActionsRef.current.onClose
      ) {
        keyActionsRef.current.onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const resolvedTitle =
    title ||
    (isFullscreen
      ? '輸入密碼解鎖應用'
      : mode === 'setup'
      ? step === 'enter'
        ? '設定 4～8 位隱私密碼'
        : '再次確認隱私密碼'
      : mode === 'verify-disable'
      ? '輸入目前密碼以解除鎖定'
      : '解鎖私密典藏');

  const resolvedSubtitle =
    subtitle ||
    (isFullscreen
      ? '已啟用「開啟 App 需要以密碼解鎖」，驗證後即可進入瀏覽。'
      : mode === 'setup'
      ? step === 'enter'
        ? '請輸入 4 至 8 位數字密碼，私密作品將以本機 AES-GCM 離線加密保存。'
        : '請再輸入一次剛才設定的密碼以完成驗證。'
      : '密碼僅驗證於本機裝置，絕不傳送至任何伺服器。');

  const submitLabel =
    mode === 'setup'
      ? step === 'enter'
        ? '下一步'
        : busy
        ? '加密設定中...'
        : '確認設定'
      : mode === 'verify-disable'
      ? busy
        ? '驗證中...'
        : '確認解除鎖定'
      : busy
      ? '解鎖中...'
      : '確認解鎖';

  const canSubmit = !busy && !isLockedOut && activeValue.length >= PIN_MIN_LENGTH;
  const dotCount = Math.max(PIN_MIN_LENGTH, activeValue.length);

  const unlockTimeLabel =
    attemptState.lockedUntil !== null
      ? new Date(attemptState.lockedUntil).toLocaleTimeString('zh-TW', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const bodyContent = (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400 text-xs font-medium min-w-0">
          {mode === 'setup' ? (
            <ShieldCheck className="w-4 h-4 shrink-0" />
          ) : (
            <Lock className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">
            {isFullscreen ? `${brandTitle} · 離線密碼鎖` : '離線加密金庫'}
          </span>
        </div>
        {!isFullscreen && onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500 tabular-nums">
            4–8 碼
          </span>
        )}
      </div>

      <div className="text-center mb-5">
        <h3 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-1.5">
          {resolvedTitle}
        </h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          {resolvedSubtitle}
        </p>
      </div>

      {/* Dynamic 4–8 digit dots */}
      <div className="flex flex-col items-center gap-2 mb-3">
        <div className="flex items-center justify-center gap-3 min-h-[20px]">
          {Array.from({ length: dotCount }).map((_, idx) => {
            const filled = idx < activeValue.length;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                  filled
                    ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] scale-110'
                    : 'border-stone-400 dark:border-stone-600 bg-transparent'
                }`}
              />
            );
          })}
        </div>
        <div className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
          {activeValue.length === 0
            ? `請輸入 ${PIN_MIN_LENGTH}～${PIN_MAX_LENGTH} 位數字`
            : activeValue.length < PIN_MIN_LENGTH
            ? `已輸入 ${activeValue.length} 位（至少需 ${PIN_MIN_LENGTH} 位）`
            : `已輸入 ${activeValue.length} / ${PIN_MAX_LENGTH} 位`}
        </div>
      </div>

      {/* Error or 30-min lockout banner */}
      <div className="min-h-[42px] flex items-center justify-center mb-3 px-2">
        {isLockedOut ? (
          <div className="w-full px-3.5 py-2.5 rounded-xl bg-[#9E3B33]/10 dark:bg-[#9E3B33]/20 border border-[#9E3B33]/25 text-center space-y-0.5">
            <div className="text-xs font-semibold text-[#9E3B33] dark:text-[#F09A91] inline-flex items-center justify-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>10 分鐘內連續輸入錯誤達 5 次，已鎖定</span>
            </div>
            <div className="text-[11px] text-[#9E3B33]/90 dark:text-[#F09A91]/90 inline-flex items-center justify-center gap-1 tabular-nums">
              <Clock className="w-3 h-3 shrink-0" />
              <span>
                請於 {formatLockoutCountdown(attemptState.remainingLockMs)} 後再試
                {unlockTimeLabel ? `（約 ${unlockTimeLabel} 解鎖）` : ''}
              </span>
            </div>
          </div>
        ) : error ? (
          <p className="text-xs text-[#9E3B33] dark:text-[#E07A70] font-medium text-center leading-relaxed">
            {error}
          </p>
        ) : usesLockout && attemptState.failedCount > 0 ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 text-center tabular-nums">
            10 分鐘內已錯誤 {attemptState.failedCount} 次，剩餘 {attemptState.remainingAttempts} 次機會
          </p>
        ) : null}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2.5 max-w-[264px] mx-auto">
        {digits.map((d) => (
          <button
            key={d}
            type="button"
            disabled={isLockedOut || busy || activeValue.length >= PIN_MAX_LENGTH}
            onClick={() => handleDigit(d)}
            className="h-13 rounded-xl bg-white dark:bg-[#232321] border border-stone-200/80 dark:border-stone-800 text-xl font-medium tabular-nums text-stone-900 dark:text-stone-100 active:scale-95 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            {d}
          </button>
        ))}

        <button
          type="button"
          disabled={isLockedOut || busy || activeValue.length === 0}
          onClick={handleClear}
          className="h-13 rounded-xl text-xs font-medium text-stone-500 dark:text-stone-400 active:scale-95 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          清除
        </button>

        <button
          type="button"
          disabled={isLockedOut || busy || activeValue.length >= PIN_MAX_LENGTH}
          onClick={() => handleDigit('0')}
          className="h-13 rounded-xl bg-white dark:bg-[#232321] border border-stone-200/80 dark:border-stone-800 text-xl font-medium tabular-nums text-stone-900 dark:text-stone-100 active:scale-95 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          0
        </button>

        <button
          type="button"
          disabled={isLockedOut || busy || activeValue.length === 0}
          onClick={handleBackspace}
          aria-label="刪除"
          className="h-13 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-400 active:scale-95 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>

      {/* Confirm Submit Button */}
      <div className="max-w-[264px] mx-auto mt-3.5 space-y-2 pb-1">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className="w-full min-h-[44px] rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-sm font-medium transition-opacity disabled:opacity-40"
        >
          {submitLabel}
        </button>

        {mode === 'setup' && step === 'confirm' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep('enter');
              setConfirmPin('');
              setError('');
            }}
            className="w-full min-h-[34px] text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 inline-flex items-center justify-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>返回修改密碼</span>
          </button>
        )}
      </div>
    </>
  );

  if (isFullscreen) {
    if (!isOpen) return null;
    return (
      <div
        data-no-swipe="true"
        className="fixed inset-0 z-[90] bg-[#F7F6F2] dark:bg-[#111110] pt-safe pb-safe flex items-center justify-center p-4 overflow-y-auto overscroll-contain"
      >
        <div className="w-full max-w-sm bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 shadow-xl">
          {bodyContent}
        </div>
      </div>
    );
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      zIndexClass="z-[80]"
      maxWidthClass="sm:max-w-sm"
      handleInsidePaddedPanel
      panelClassName="bg-[#F7F6F2] dark:bg-[#191918] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl p-6 pb-safe shadow-xl"
    >
      {bodyContent}
    </BottomSheet>
  );
};
