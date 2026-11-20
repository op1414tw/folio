import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Feather,
  FolderArchive,
  Lock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface WelcomeModalProps {
  isOpen: boolean;
  brandTitle: string;
  remainingSeedCount: number;
  onClose: () => void;
  onClearSeedWorks: () => Promise<void>;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  brandTitle,
  remainingSeedCount,
  onClose,
  onClearSeedWorks,
}) => {
  const [step, setStep] = useState(0);
  const [clearChoice, setClearChoice] = useState<'keep' | 'clear'>('keep');
  const [clearing, setClearing] = useState(false);

  const handleFinish = async () => {
    if (clearChoice === 'clear' && remainingSeedCount > 0) {
      setClearing(true);
      try {
        await onClearSeedWorks();
      } finally {
        setClearing(false);
      }
    }
    setStep(0);
    onClose();
  };

  const handleSkip = () => {
    setStep(0);
    onClose();
  };

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
                {[0, 1, 2].map((idx) => (
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
                          設定 4 位數密碼即可將私密手稿與影像於本機加密封存，不經過任何外部伺服器。
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
                        準備就緒
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
              </AnimatePresence>
            </div>

            {/* Footer Navigation */}
            <div className="px-6 py-4 pb-safe border-t border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3 bg-[#F7F6F2] dark:bg-[#171716]">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="min-h-[42px] px-3.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>上一步</span>
                </button>
              ) : (
                <span className="text-[11px] text-stone-400">1 / 3</span>
              )}

              {step < 2 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="min-h-[42px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <span>下一步</span>
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
                      ? '清除中...'
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
