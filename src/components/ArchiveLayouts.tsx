import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Compass, Loader2, Plus } from 'lucide-react';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { Collection, LayoutMode, WorkItem } from '../types';
import { WorkCard } from './WorkCard';

const LazyOfflineGeoMap = React.lazy(() =>
  import('./OfflineGeoMap').then((mod) => ({ default: mod.OfflineGeoMap }))
);

interface ArchiveLayoutsProps {
  works: WorkItem[];
  collections: Collection[];
  layout: LayoutMode;
  filterTransitionKey?: string;
  onSelectWork: (work: WorkItem) => void;
  onToggleFavorite?: (work: WorkItem, e: React.MouseEvent) => void;
  onCreateNew: () => void;
  hasActiveFilter: boolean;
  onClearFilter: () => void;
}

export const GeoMapSkeleton: React.FC = () => {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="space-y-3"
    >
      {/* Header Bar Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#242422] flex items-center justify-center text-stone-400 shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="space-y-1.5">
            <div className="h-4 w-44 rounded-md bg-stone-200/80 dark:bg-stone-800 animate-pulse" />
            <div className="h-3 w-32 rounded-md bg-stone-200/60 dark:bg-stone-800/70 animate-pulse" />
          </div>
        </div>
        <div className="h-[44px] w-full sm:w-44 rounded-xl bg-[#EFECE6] dark:bg-[#242422] animate-pulse shrink-0" />
      </div>

      {/* Cartographic Map Viewport Skeleton */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border border-stone-200/80 dark:border-stone-800 bg-[#EFECE3] dark:bg-[#151718] flex items-center justify-center"
        style={{ height: 'clamp(420px, 60vh, 680px)' }}
      >
        {/* Graticule placeholder lines */}
        <div className="absolute inset-0 pointer-events-none opacity-45">
          <div className="w-full h-full grid grid-cols-4 grid-rows-4">
            {Array.from({ length: 16 }).map((_, idx) => (
              <div
                key={idx}
                className="border border-dashed border-stone-400/25 dark:border-stone-700/35"
              />
            ))}
          </div>
        </div>

        {/* Silhouette landmass placeholder */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-56 rounded-[45%_55%_60%_40%] bg-stone-300/65 dark:bg-stone-800/75 animate-pulse rotate-12 pointer-events-none" />
        <div className="absolute left-[46%] top-[36%] w-5 h-5 rounded-full bg-stone-400/50 dark:bg-stone-700/70 animate-pulse pointer-events-none" />
        <div className="absolute left-[53%] top-[51%] w-5 h-5 rounded-full bg-stone-400/50 dark:bg-stone-700/70 animate-pulse pointer-events-none" />
        <div className="absolute left-[44%] top-[63%] w-5 h-5 rounded-full bg-stone-400/50 dark:bg-stone-700/70 animate-pulse pointer-events-none" />

        {/* Corner control placeholders */}
        <div className="absolute top-3.5 right-3.5 w-11 h-28 rounded-xl bg-white/75 dark:bg-[#1E1E1C]/75 border border-stone-200/70 dark:border-stone-800 animate-pulse pointer-events-none" />
        <div className="absolute bottom-3.5 left-3.5 w-28 h-10 rounded-xl bg-white/75 dark:bg-[#1C1C1A]/75 border border-stone-200/70 dark:border-stone-800 animate-pulse pointer-events-none" />
        <div className="absolute bottom-3.5 right-3.5 w-36 h-10 rounded-xl bg-white/75 dark:bg-[#1E1E1C]/75 border border-stone-200/70 dark:border-stone-800 animate-pulse pointer-events-none" />

        {/* Centered Loading Indicator */}
        <div className="relative z-10 px-5 py-3.5 rounded-2xl bg-white/92 dark:bg-[#1E1E1C]/92 border border-stone-200 dark:border-stone-800 shadow-lg flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] animate-spin shrink-0" />
          <div className="text-left">
            <div className="text-xs font-semibold text-stone-800 dark:text-stone-100">
              正在載入離線地理圖層
            </div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400">
              繪製本機向量輪廓與足跡座標⋯
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ArchiveLayouts: React.FC<ArchiveLayoutsProps> = React.memo(({
  works,
  collections,
  layout,
  filterTransitionKey = 'all',
  onSelectWork,
  onToggleFavorite,
  onCreateNew,
  hasActiveFilter,
  onClearFilter,
}) => {
  const { animationOverhaul } = useMotionPreferences();
  const [isGeoMapReady, setIsGeoMapReady] = useState(false);

  // Track initial mount vs in-tab layout / filter transitions so switching tabs
  // does not collide inner stagger/scale animations with App's tab slide.
  const hasMountedRef = useRef(false);
  const prevLayoutRef = useRef<LayoutMode>(layout);
  const layoutChangedInTab = hasMountedRef.current && prevLayoutRef.current !== layout;

  useEffect(() => {
    hasMountedRef.current = true;
    prevLayoutRef.current = layout;
  }, [layout, filterTransitionKey]);

  useEffect(() => {
    if (layout !== 'map') {
      setIsGeoMapReady(false);
    }
  }, [layout]);

  const handleGeoMapReady = useCallback(() => {
    setIsGeoMapReady(true);
  }, []);

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.id, c.name])),
    [collections]
  );
  const getCollectionName = (id: string) => collectionMap.get(id) || '未分類';

  if (works.length === 0) {
    return (
      <motion.div
        key={`empty-${filterTransitionKey}`}
        initial={hasMountedRef.current && animationOverhaul ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.25, 0.9, 0.35, 1] }}
        className="py-16 px-6 text-center max-w-md mx-auto"
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EFECE6] dark:bg-[#1B1B19] border border-stone-200 dark:border-stone-800 flex items-center justify-center text-stone-500 dark:text-stone-400 mb-4">
          <BookOpen className="w-6 h-6" />
        </div>
        <h3 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          {hasActiveFilter ? '找不到符合條件的作品' : '卷宗目前為空白'}
        </h3>
        <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed mb-6">
          {hasActiveFilter
            ? '試著更換搜尋關鍵字、標籤，或清除目前的篩選條件。'
            : '開始儲存你的第一張攝影底片或一段手寫文字，所有內容都會安全地儲存在本機離線空間。'}
        </p>
        {hasActiveFilter ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="px-5 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            顯示全部作品
          </button>
        ) : (
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>新增第一件作品</span>
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      key={`${layout}:${filterTransitionKey}`}
      initial={
        hasMountedRef.current
          ? animationOverhaul
            ? layoutChangedInTab
              ? { opacity: 0 }
              : { opacity: 0, y: 8 }
            : { opacity: 0 }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={
        animationOverhaul
          ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0.14, ease: [0.16, 1, 0.3, 1] }
      }
      className="will-change-[transform,opacity]"
    >
      {layout === 'masonry' && (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-5">
          {works.map((work, idx) => (
            <WorkCard
              key={work.id}
              work={work}
              collectionName={getCollectionName(work.collectionId)}
              variant="masonry"
              onSelect={onSelectWork}
              onToggleFavorite={onToggleFavorite}
              index={idx}
              animateEntrance={animationOverhaul && layoutChangedInTab}
            />
          ))}
        </div>
      )}

      {layout === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {works.map((work, idx) => (
            <WorkCard
              key={work.id}
              work={work}
              collectionName={getCollectionName(work.collectionId)}
              variant="grid"
              onSelect={onSelectWork}
              onToggleFavorite={onToggleFavorite}
              index={idx}
              animateEntrance={animationOverhaul && layoutChangedInTab}
            />
          ))}
        </div>
      )}

      {layout === 'index' && (
        <div className="bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 rounded-2xl px-3 sm:px-5 py-2 divide-y divide-stone-100 dark:divide-stone-800/80">
          {works.map((work, idx) => (
            <WorkCard
              key={work.id}
              work={work}
              collectionName={getCollectionName(work.collectionId)}
              variant="index"
              onSelect={onSelectWork}
              onToggleFavorite={onToggleFavorite}
              index={idx}
              animateEntrance={animationOverhaul && layoutChangedInTab}
            />
          ))}
        </div>
      )}

      {layout === 'magazine' && (
        <div className="max-w-3xl mx-auto space-y-8 sm:space-y-10">
          {works.map((work, idx) => (
            <WorkCard
              key={work.id}
              work={work}
              collectionName={getCollectionName(work.collectionId)}
              variant="magazine"
              onSelect={onSelectWork}
              onToggleFavorite={onToggleFavorite}
              index={idx}
              animateEntrance={animationOverhaul && layoutChangedInTab}
            />
          ))}
        </div>
      )}

      {layout === 'map' && (
        <div className="relative">
          {!isGeoMapReady && <GeoMapSkeleton />}
          <div
            className={
              isGeoMapReady
                ? 'opacity-100 transition-opacity duration-200'
                : 'opacity-0 pointer-events-none absolute inset-0 overflow-hidden'
            }
          >
            <Suspense fallback={null}>
              <LazyOfflineGeoMap
                works={works}
                collections={collections}
                onSelectWork={onSelectWork}
                onToggleFavorite={onToggleFavorite}
                onReady={handleGeoMapReady}
              />
            </Suspense>
          </div>
        </div>
      )}
    </motion.div>
  );
});
ArchiveLayouts.displayName = 'ArchiveLayouts';
