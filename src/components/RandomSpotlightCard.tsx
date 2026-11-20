import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Shuffle, X } from 'lucide-react';
import { Collection, WorkItem } from '../types';

interface RandomSpotlightCardProps {
  works: WorkItem[];
  collections: Collection[];
  conciseCopyMode?: boolean;
  onSelectWork: (work: WorkItem) => void;
}

export const RandomSpotlightCard: React.FC<RandomSpotlightCardProps> = ({
  works,
  collections,
  conciseCopyMode = false,
  onSelectWork,
}) => {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const eligiblePool = useMemo(() => {
    const unlocked = works.filter((w) => !(w.isPrivate && w.isSealed));
    const favorites = unlocked.filter((w) => w.favorite);
    return favorites.length > 0 ? favorites : unlocked;
  }, [works]);

  const pickedWork = useMemo(
    () => eligiblePool.find((w) => w.id === pickedId) || null,
    [eligiblePool, pickedId]
  );

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.id, c.name])),
    [collections]
  );

  const handleDrawRandom = () => {
    if (eligiblePool.length === 0) return;
    setImgError(false);
    const candidates =
      eligiblePool.length > 1
        ? eligiblePool.filter((w) => w.id !== pickedId)
        : eligiblePool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setPickedId(chosen.id);
  };

  if (eligiblePool.length === 0) return null;

  return (
    <section
      aria-label="拾光隨機精選"
      className="rounded-xl bg-[#EFECE6]/85 dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden transition-colors"
    >
      {!pickedWork ? (
        <button
          type="button"
          onClick={handleDrawRandom}
          className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-stone-200/40 dark:hover:bg-stone-800/40 transition-colors group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-editorial text-base font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap">
              拾光隨機
            </span>
            {!conciseCopyMode && (
              <span className="text-xs text-stone-500 dark:text-stone-400 truncate">
                點擊隨機挑選一件精選作品展示
              </span>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#232321] border border-stone-200 dark:border-stone-700 flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0 group-hover:scale-105 transition-transform">
            <Shuffle className="w-3.5 h-3.5" />
          </div>
        </button>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={pickedWork.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="px-4 py-3 flex items-center gap-3.5"
          >
            {pickedWork.type === 'photography' && pickedWork.imageData && !imgError && (
              <div
                onClick={() => onSelectWork(pickedWork)}
                className="w-14 h-14 rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-800 shrink-0 cursor-pointer"
              >
                <img
                  src={pickedWork.imageData}
                  alt={pickedWork.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div
              onClick={() => onSelectWork(pickedWork)}
              className="flex-1 min-w-0 cursor-pointer"
            >
              <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                拾光隨機 · {pickedWork.type === 'photography' ? '攝影' : pickedWork.writingGenre || '文字'} ·{' '}
                {collectionMap.get(pickedWork.collectionId) || '未分類'} ·{' '}
                <span className="tabular-nums">{pickedWork.createdAt}</span>
              </div>
              <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100 truncate">
                {pickedWork.title}
              </h3>
              {pickedWork.content && (
                <p className="text-xs text-stone-600 dark:text-stone-300 truncate mt-0.5">
                  {pickedWork.content}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onSelectWork(pickedWork)}
                className="min-h-[36px] px-3 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1 hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <span>細讀</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDrawRandom}
                aria-label="再抽一件"
                title="再抽一件"
                className="min-h-[36px] min-w-[36px] rounded-lg border border-stone-300/80 dark:border-stone-700 bg-white/70 dark:bg-[#232321] text-stone-700 dark:text-stone-300 flex items-center justify-center hover:bg-white dark:hover:bg-stone-800 transition-colors"
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPickedId(null)}
                aria-label="收合隨機展示"
                title="收合"
                className="min-h-[36px] min-w-[36px] rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </section>
  );
};
