import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Feather,
  FolderArchive,
  Layers,
  Lock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface WelcomeModalProps {
  isOpen: boolean;
  brandTitle: string;
  remainingSeedCount: number;
  initialMinimalMode?: boolean;
  initialAuthorName?: string;
  initialSealText?: string;
  onSelectMinimalMode?: (minimal: boolean) => void | Promise<void>;
  onSaveIdentity?: (identity: { authorName: string; sealText: string }) => void | Promise<void>;
  onClose: () => void;
  onClearSeedWorks: () => Promise<void>;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  brandTitle,
  remainingSeedCount,
  initialMinimalMode = false,
  initialAuthorName = '林硯',
  initialSealText = '硯',
  onSelectMinimalMode,
  onSaveIdentity,
  onClose,
  onClearSeedWorks,
}) => {
  const [step, setStep] = useState(0);
  const [clearChoice, setClearChoice] = useState<'keep' | 'clear'>('keep');
  const [modeChoice, setModeChoice] = useState<'normal' | 'minimal'>(
    initialMinimalMode ? 'minimal' : 'normal'
  );
  const [identityChoice, setIdentityChoice] = useState<'default' | 'custom'>('default');
  const [authorDraft, setAuthorDraft] = useState(initialAuthorName);
  const [sealDraft, setSealDraft] = useState(initialSealText);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setModeChoice(initialMinimalMode ? 'minimal' : 'normal');
      setIdentityChoice('default');
      setAuthorDraft(initialAuthorName || '林硯');
      setSealDraft(initialSealText || '硯');
    }
  }, [isOpen, initialMinimalMode, initialAuthorName, initialSealText]);

  const stepIndices = modeChoice === 'normal' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
  const lastStepIndex = stepIndices[stepIndices.length - 1];

  useEffect(() => {
    if (modeChoice === 'minimal' && step > 3) {
      setStep(3);
    }
  }, [modeChoice, step]);

  const handleFinish = async () => {
    setClearing(true);
    try {
      if (onSelectMinimalMode) {
        await onSelectMinimalMode(modeChoice === 'minimal');
      }
      if (modeChoice === 'normal' && identityChoice === 'custom' && onSaveIdentity) {
        const cleanedAuthor = authorDraft.trim() || initialAuthorName || '林硯';
        const cleanedSeal = sealDraft.trim().slice(0, 2) || initialSealText || '硯';
        await onSaveIdentity({
          authorName: cleanedAuthor,
          sealText: cleanedSeal,
        });
      }
      if (clearChoice === 'clear' && remainingSeedCount > 0) {
        await onClearSeedWorks();
      }
    } finally {
      setClearing(false);
    }
    setStep(0);
    onClose();
  };

  const handleSkip = () => {
    setStep(0);
    onClose();
  };

  const previewAuthor = authorDraft.trim() || initialAuthorName || '林硯';
  const previewSeal = sealDraft.trim().slice(0, 2) || initialSealText || '硯';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleSkip}
      closeOnBackdrop={false}
      zIndexClass="z-[90]"
      backdropToneClass="bg-black/55"
      maxWidthClass="sm:max-w-lg"
      panelClassName="bg-[#F7F6F2] dark:bg-[#171716] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
    >
            {/* Top Bar */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {stepIndices.map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setStep(idx)}
                    aria-label={`前往第 ${idx + 1} 步`}
                    className={`h-1.5 rounded-full transition-all ${
                      step === idx
                        ? 'w-7 bg-[#284152] dark:bg-[#E7E5E0]'
                        : 'w-2 bg-stone-300 dark:bg-stone-700'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={handleSkip}
                className="min-h-[36px] px-2 text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                略過指引
              </button>
            </div>

            {/* Step Content */}
            <div className="px-6 py-4 flex-1 overflow-y-auto overscroll-contain">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <p className="text-xs font-medium tracking-wider text-[#9E3B33] dark:text-[#E07A70]">
                        純本機離線創作典藏空間
                      </p>
                      <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 leading-snug text-balance">
                        歡迎來到「{brandTitle || '拾光卷宗'}」
                      </h2>
                      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                        這是一個完全離線運作、無需網路與雲端帳號的個人作品典藏庫，專為保存攝影底片與長短篇文字而設計。
                      </p>
                    </div>

                    <div className="space-y-3 pt-1">
                      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#EFECE6] dark:bg-[#252523] flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                            攝影作品與 EXIF 參數紀錄
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                            匯入相簿照片時自動讀取相機型號、焦段與快門資訊，支援瀑布流、畫廊、清單與雜誌四種閱覽排版。
                          </p>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#EFECE6] dark:bg-[#252523] flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                          <Feather className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                            現代詩、隨筆與章節小說
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                            支援分章分段撰寫章節小說，長文閱讀器附有章節目錄與捲動進度條，提供專注沈浸的紙感閱讀體驗。
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <p className="text-xs font-medium tracking-wider text-[#9E3B33] dark:text-[#E07A70]">
                        整理 · 加密 · 分享與讀本
                      </p>
                      <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 leading-snug text-balance">
                        靈活歸檔與跨平台離線備份
                      </h2>
                      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                        所有整理、密碼鎖定與出版製作工具皆於本機完成運算，保護您的隱私與創作手稿。
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 flex items-start gap-3">
                        <BookOpen className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] shrink-0 mt-0.5" />
                        <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                          <span className="font-semibold text-stone-900 dark:text-stone-100">
                            作品集整理與檔案總管：
                          </span>
                          作品集支援子分類與拖曳排序；備份頁內建檔案總管介面，可依條件篩選並批量編輯標籤、移入作品集或加入私密。
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 flex items-start gap-3">
                        <Lock className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] shrink-0 mt-0.5" />
                        <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                          <span className="font-semibold text-stone-900 dark:text-stone-100">
                            AES-GCM 隱私加密鎖：
                          </span>
                          設定 4～8 位數字密碼即可將私密手稿與影像於本機加密封存，不經過任何外部伺服器。
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 flex items-start gap-3">
                        <Sparkles className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] shrink-0 mt-0.5" />
                        <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                          <span className="font-semibold text-stone-900 dark:text-stone-100">
                            圖卡工作室與讀本備份：
                          </span>
                          內建手寫字體與長文多圖分頁生成，並可匯出跨平台 ZIP 整理包、JSON 備份檔及附目錄的 PDF 電子讀本。
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <p className="text-xs font-medium tracking-wider text-[#9E3B33] dark:text-[#E07A70]">
                        初始典藏範例
                      </p>
                      <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 leading-snug text-balance">
                        選擇您的初始典藏狀態
                      </h2>
                      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                        {remainingSeedCount > 0
                          ? `目前預載了 ${remainingSeedCount} 件攝影與文字範例作品供您預覽排版與功能，您可在下方決定是否直接清除。`
                          : '系統內建的範例作品已清除，您隨時可以開始收錄自己的創作。'}
                      </p>
                    </div>

                    {remainingSeedCount > 0 ? (
                      <div className="space-y-2.5">
                        <button
                          type="button"
                          onClick={() => setClearChoice('keep')}
                          className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                            clearChoice === 'keep'
                              ? 'border-[#284152] dark:border-[#E7E5E0] bg-white dark:bg-[#1E1E1C] ring-1 ring-[#284152]/20'
                              : 'border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1B1B19]'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                              clearChoice === 'keep'
                                ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                                : 'border-stone-300 dark:border-stone-600'
                            }`}
                          >
                            {clearChoice === 'keep' && <Check className="w-3 h-3" />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                              保留內建範例作品體驗
                            </div>
                            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                              先瀏覽示範排版、圖卡與章節功能，之後仍可至「備份與隱私」頁面最下方一鍵清除。
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setClearChoice('clear')}
                          className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                            clearChoice === 'clear'
                              ? 'border-[#9E3B33] bg-white dark:bg-[#1E1E1C] ring-1 ring-[#9E3B33]/25'
                              : 'border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1B1B19]'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                              clearChoice === 'clear'
                                ? 'bg-[#9E3B33] border-[#9E3B33] text-white'
                                : 'border-stone-300 dark:border-stone-600'
                            }`}
                          >
                            {clearChoice === 'clear' && <Trash2 className="w-3 h-3" />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                              清除自帶的範例作品（空白開始）
                            </div>
                            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                              移除系統預載的 {remainingSeedCount} 件範例作品與空白範例作品集，打造純淨的個人作品庫。
                            </p>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 flex items-center gap-3">
                        <FolderArchive className="w-5 h-5 text-[#284152] dark:text-[#E7E5E0] shrink-0" />
                        <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                          範例作品已全部清除完成，您目前的典藏空間僅包含個人收錄作品。
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <p className="text-xs font-medium tracking-wider text-[#9E3B33] dark:text-[#E07A70]">
                        {modeChoice === 'minimal' ? '準備就緒 · 最後一步' : '操作模式偏好'}
                      </p>
                      <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 leading-snug text-balance">
                        選擇您的操作模式
                      </h2>
                      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                        依照您的創作習慣選擇介面呈現方式，未來隨時都能於「備份與隱私」設定頁面中切換。
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() => setModeChoice('normal')}
                        className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          modeChoice === 'normal'
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-white dark:bg-[#1E1E1C] ring-1 ring-[#284152]/20'
                            : 'border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1B1B19]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            modeChoice === 'normal'
                              ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                              : 'border-stone-300 dark:border-stone-600'
                          }`}
                        >
                          {modeChoice === 'normal' && <Layers className="w-3 h-3" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                            普通模式（完整功能）
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                            開放所有功能模組：作品集整理、統計圖表、地理分佈、分享圖卡工作室及 PDF 電子讀本匯出。
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModeChoice('minimal')}
                        className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          modeChoice === 'minimal'
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-white dark:bg-[#1E1E1C] ring-1 ring-[#284152]/20'
                            : 'border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1B1B19]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            modeChoice === 'minimal'
                              ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                              : 'border-stone-300 dark:border-stone-600'
                          }`}
                        >
                          {modeChoice === 'minimal' && <Feather className="w-3 h-3" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                            極簡模式（純粹專注）
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                            僅保留作品典藏瀏覽、閱讀撰寫、私密鎖定與離線備份，隱藏複雜工具讓畫面純淨無干擾。
                          </p>
                        </div>
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === 4 && modeChoice === 'normal' && (
                  <motion.div
                    key="step-4"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <p className="text-xs font-medium tracking-wider text-[#9E3B33] dark:text-[#E07A70]">
                        準備就緒 · 最後一步
                      </p>
                      <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 leading-snug text-balance">
                        是否設定署名與印章文字？
                      </h2>
                      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                        個人署名與紅色方印會顯示在作品落款、分享圖卡與 PDF 電子讀本封面，之後隨時可於設定修改。
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() => setIdentityChoice('default')}
                        className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          identityChoice === 'default'
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-white dark:bg-[#1E1E1C] ring-1 ring-[#284152]/20'
                            : 'border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1B1B19]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            identityChoice === 'default'
                              ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                              : 'border-stone-300 dark:border-stone-600'
                          }`}
                        >
                          {identityChoice === 'default' && <Check className="w-3 h-3" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                            暫不設定，先使用預設落款
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                            維持目前預設：署名「{initialAuthorName || '林硯'}」 · 印章「
                            {initialSealText || '硯'}」。
                          </p>
                        </div>
                      </button>

                      <div
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          identityChoice === 'custom'
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-white dark:bg-[#1E1E1C] ring-1 ring-[#284152]/20'
                            : 'border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1B1B19]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setIdentityChoice('custom')}
                          className="w-full p-4 text-left flex items-start gap-3"
                        >
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                              identityChoice === 'custom'
                                ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                                : 'border-stone-300 dark:border-stone-600'
                            }`}
                          >
                            {identityChoice === 'custom' && <Check className="w-3 h-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                              要，現在自訂我的署名與印章
                            </div>
                            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                              為每張圖卡與手稿落款印上專屬名字與紅印。
                            </p>
                          </div>
                        </button>

                        {identityChoice === 'custom' && (
                          <div className="px-4 pb-4 pt-2 border-t border-stone-100 dark:border-stone-800 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="block">
                                <span className="block text-[11px] font-medium text-stone-600 dark:text-stone-400 mb-1">
                                  作者署名
                                </span>
                                <input
                                  type="text"
                                  maxLength={20}
                                  value={authorDraft}
                                  onChange={(e) => setAuthorDraft(e.target.value)}
                                  placeholder="例：林硯"
                                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#284152]/20"
                                />
                              </label>

                              <label className="block">
                                <span className="block text-[11px] font-medium text-stone-600 dark:text-stone-400 mb-1">
                                  印章文字（1～2 字）
                                </span>
                                <input
                                  type="text"
                                  maxLength={2}
                                  value={sealDraft}
                                  onChange={(e) => setSealDraft(e.target.value)}
                                  placeholder="例：硯"
                                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#284152]/20"
                                />
                              </label>
                            </div>

                            {/* Live Seal & Signature Preview */}
                            <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800 flex items-center justify-between gap-3">
                              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                                落款預覽
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-editorial text-sm font-medium text-stone-800 dark:text-stone-200">
                                  {previewAuthor}
                                </span>
                                <span className="w-7 h-7 rounded border-2 border-[#9E3B33] text-[#9E3B33] font-editorial text-xs font-bold flex items-center justify-center leading-none">
                                  {previewSeal}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer Navigation */}
            <div className="px-6 py-4 pb-safe border-t border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3 bg-[#F7F6F2] dark:bg-[#171716]">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="min-h-[42px] px-3.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>上一步</span>
                </button>
              ) : (
                <span className="text-[11px] text-stone-400 tabular-nums">
                  1 / {stepIndices.length}
                </span>
              )}

              {step < lastStepIndex ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(lastStepIndex, s + 1))}
                  className="min-h-[42px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <span>{step === 3 && modeChoice === 'normal' ? '繼續' : '下一步'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => void handleFinish()}
                  className={`min-h-[42px] px-5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-opacity disabled:opacity-50 ${
                    clearChoice === 'clear' && remainingSeedCount > 0
                      ? 'bg-[#9E3B33] text-white'
                      : 'bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                  }`}
                >
                  <span>
                    {clearing
                      ? '設定中...'
                      : clearChoice === 'clear' && remainingSeedCount > 0
                      ? '清除範例並進入'
                      : '進入拾光卷宗'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
    </BottomSheet>
  );
};
