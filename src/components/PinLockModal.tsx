import React, { useEffect, useState } from 'react';
import { Delete, Lock, ShieldCheck, X } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface PinLockModalProps {
  isOpen: boolean;
  mode: 'unlock' | 'setup' | 'verify-disable';
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSubmitPin: (pin: string) => Promise<boolean>;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  isOpen,
  mode,
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

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setConfirmPin('');
      setStep('enter');
      setError('');
      setBusy(false);
    }
  }, [isOpen, mode]);

  const activeValue = step === 'enter' ? pin : confirmPin;
  const maxLength = 4;

  const handleDigit = async (digit: string) => {
    if (busy) return;
    setError('');

    if (step === 'enter') {
      if (pin.length >= maxLength) return;
      const next = pin + digit;
      setPin(next);

      if (next.length === maxLength) {
        if (mode === 'setup') {
          setTimeout(() => {
            setStep('confirm');
          }, 120);
        } else {
          setBusy(true);
          try {
            const ok = await onSubmitPin(next);
            if (!ok) {
              setError('密碼不正確，請再試一次');
              setPin('');
            }
          } catch {
            setError('驗證過程發生異常，請重試');
            setPin('');
          } finally {
            setBusy(false);
          }
        }
      }
    } else {
      if (confirmPin.length >= maxLength) return;
      const next = confirmPin + digit;
      setConfirmPin(next);

      if (next.length === maxLength) {
        if (next !== pin) {
          setError('兩次輸入的密碼不一致，請重新設定');
          setPin('');
          setConfirmPin('');
          setStep('enter');
        } else {
          setBusy(true);
          try {
            const ok = await onSubmitPin(next);
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
        }
      }
    }
  };

  const handleBackspace = () => {
    if (busy) return;
    setError('');
    if (step === 'enter') {
      setPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const keyActionsRef = React.useRef({ handleDigit, handleBackspace, onClose });
  keyActionsRef.current = { handleDigit, handleBackspace, onClose };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        void keyActionsRef.current.handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        keyActionsRef.current.handleBackspace();
      } else if (e.key === 'Escape') {
        keyActionsRef.current.onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const resolvedTitle =
    title ||
    (mode === 'setup'
      ? step === 'enter'
        ? '設定 4 位數隱私密碼'
        : '再次確認隱私密碼'
      : mode === 'verify-disable'
      ? '輸入目前密碼以解除鎖定'
      : '解鎖私密典藏');

  const resolvedSubtitle =
    subtitle ||
    (mode === 'setup'
      ? '私密作品將透過本地 AES-GCM 離線加密保存。'
      : '密碼僅驗證於本機裝置，絕不傳送至任何伺服器。');

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      zIndexClass="z-[80]"
      maxWidthClass="sm:max-w-sm"
      handleInsidePaddedPanel
      panelClassName="bg-[#F7F6F2] dark:bg-[#191918] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl p-6 pb-safe shadow-xl"
    >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400 text-xs font-medium">
                {mode === 'setup' ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>離線加密金庫</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center mb-6">
              <h3 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-1.5">
                {resolvedTitle}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                {resolvedSubtitle}
              </p>
            </div>

            {/* PIN dots */}
            <div className="flex items-center justify-center gap-4 mb-4">
              {Array.from({ length: maxLength }).map((_, idx) => {
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

            <div className="h-5 text-center mb-4">
              {error && (
                <p className="text-xs text-[#9E3B33] dark:text-[#E07A70] font-medium">{error}</p>
              )}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto pb-2">
              {digits.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => void handleDigit(d)}
                  className="h-14 rounded-xl bg-white dark:bg-[#232321] border border-stone-200/80 dark:border-stone-800 text-xl font-medium tabular-nums text-stone-900 dark:text-stone-100 active:scale-95 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => void handleDigit('0')}
                className="h-14 rounded-xl bg-white dark:bg-[#232321] border border-stone-200/80 dark:border-stone-800 text-xl font-medium tabular-nums text-stone-900 dark:text-stone-100 active:scale-95 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                aria-label="刪除"
                className="h-14 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-400 active:scale-95 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-all"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
    </BottomSheet>
  );
};
