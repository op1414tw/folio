import React, { useState } from 'react';
import { Camera, Feather, Heart, Lock } from 'lucide-react';
import { WorkItem } from '../types';

interface WorkCardProps {
  work: WorkItem;
  collectionName: string;
  variant: 'masonry' | 'grid' | 'index' | 'magazine';
  onSelect: (work: WorkItem) => void;
  onToggleFavorite?: (work: WorkItem, e: React.MouseEvent) => void;
  index?: number;
  animateEntrance?: boolean;
}

export const WorkCard: React.FC<WorkCardProps> = React.memo(({
  work,
  collectionName,
  variant,
  onSelect,
  onToggleFavorite,
  index = 0,
  animateEntrance = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const animClass = animateEntrance ? 'work-card-animated' : '';
  const animStyle = animateEntrance
    ? ({ '--card-delay': `${Math.min(index, 9) * 28}ms` } as React.CSSProperties)
    : undefined;

  const isLocked = work.isPrivate && work.isSealed;
  const chapterCount =
    work.type === 'writing' && work.writingGenre === '章節小說' && work.chapters?.length
      ? work.chapters.length
      : 0;
  const charCount =
    chapterCount > 0
      ? work.chapters!.reduce((sum, ch) => sum + ch.content.replace(/\s+/g, '').length, 0)
      : work.content
      ? work.content.replace(/\s+/g, '').length
      : 0;
  const collectionLabel = work.category ? `${collectionName} / ${work.category}` : collectionName;

  if (isLocked) {
    if (variant === 'index') {
      return (
        <button
          type="button"
          onClick={() => onSelect(work)}
          style={animStyle}
          className={`work-card-cv ${animClass} w-full text-left py-4 px-2 flex items-center justify-between gap-4 hover:bg-stone-200/40 dark:hover:bg-stone-800/40 transition-colors rounded-lg`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-lg bg-stone-200/70 dark:bg-stone-800/80 flex items-center justify-center shrink-0 text-stone-500 dark:text-stone-400">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-editorial text-lg font-semibold text-stone-800 dark:text-stone-200 truncate">
                已加密私密作品
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                點擊輸入密碼解鎖查閱 · {collectionName}
              </p>
            </div>
          </div>
          <span className="text-xs tabular-nums text-stone-400 shrink-0">{work.createdAt}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onSelect(work)}
        style={animStyle}
        className={`work-card-cv ${animClass} w-full text-left group block bg-[#EFECE6] dark:bg-[#1B1B19] border border-stone-200/80 dark:border-stone-800 rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]`}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-11 h-11 rounded-full bg-white/80 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 mb-3 border border-stone-200/70 dark:border-stone-700">
            <Lock className="w-4 h-4" />
          </div>
          <p className="font-editorial text-lg font-semibold text-stone-800 dark:text-stone-200 mb-1">
            私密典藏已上鎖
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {collectionName} · {work.createdAt}
          </p>
        </div>
      </button>
    );
  }

  // 1. EDITORIAL INDEX ROW LAYOUT
  if (variant === 'index') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(work)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(work);
          }
        }}
        style={animStyle}
        className={`work-card-cv ${animClass} w-full text-left py-4 px-2 sm:px-3 flex items-center justify-between gap-4 hover:bg-stone-200/40 dark:hover:bg-stone-800/40 transition-colors rounded-xl cursor-pointer group`}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {work.type === 'photography' && work.imageData && !imgError ? (
            <img
              src={work.imageData}
              alt={work.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-14 h-14 rounded-lg object-cover shrink-0 bg-stone-200 dark:bg-stone-800"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-[#EFECE6] dark:bg-[#1E1E1C] border border-stone-200/70 dark:border-stone-800 flex items-center justify-center shrink-0 text-stone-500 dark:text-stone-400">
              {work.type === 'photography' ? (
                <Camera className="w-5 h-5" />
              ) : (
                <span className="font-editorial text-xl font-semibold text-stone-700 dark:text-stone-300">
                  {work.title.slice(0, 1) || '文'}
                </span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100 truncate">
                {work.title}
              </h3>
              {work.isPrivate && (
                <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-label="私密作品" />
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
              {work.type === 'photography' ? '攝影' : work.writingGenre || '文字'} · {collectionLabel}
              {work.subtitle ? ` · ${work.subtitle}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => onToggleFavorite(work, e)}
              aria-label={work.favorite ? '取消收藏' : '加入收藏'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-stone-400 hover:text-[#9E3B33] dark:hover:text-[#E07A70] transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${
                  work.favorite ? 'fill-[#9E3B33] text-[#9E3B33] dark:fill-[#E07A70] dark:text-[#E07A70]' : ''
                }`}
              />
            </button>
          )}
          <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400 hidden sm:inline">
            {work.createdAt}
          </span>
        </div>
      </div>
    );
  }

  // 2. GALLERY GRID LAYOUT (Consistent 4:5 museum framing)
  if (variant === 'grid') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(work)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(work);
          }
        }}
        style={animStyle}
        className={`work-card-cv ${animClass} group cursor-pointer flex flex-col`}
      >
        <div className="relative aspect-[4/5] w-full rounded-xl overflow-hidden bg-white dark:bg-[#1B1B19] border border-stone-200/80 dark:border-stone-800 transition-transform duration-200 group-hover:-translate-y-0.5">
          {work.type === 'photography' && work.imageData && !imgError ? (
            <img
              src={work.imageData}
              alt={work.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full p-5 flex flex-col justify-between bg-[#FBFBF9] dark:bg-[#1A1A18]">
              <div className="flex items-center justify-between text-[11px] text-stone-400">
                <span>{work.writingGenre || '文字手記'}</span>
                <span className="tabular-nums">
                  {chapterCount > 0 ? `${chapterCount} 章` : `${charCount} 字`}
                </span>
              </div>
              <p className="font-editorial text-base leading-relaxed text-stone-700 dark:text-stone-300 line-clamp-6 whitespace-pre-line">
                {work.content}
              </p>
              <div className="w-6 h-px bg-stone-300 dark:bg-stone-700" />
            </div>
          )}

          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => onToggleFavorite(work, e)}
              aria-label={work.favorite ? '取消收藏' : '加入收藏'}
              className="absolute top-2 right-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/35 text-white opacity-90 hover:bg-black/50 transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${work.favorite ? 'fill-[#E07A70] text-[#E07A70]' : 'text-white'}`}
              />
            </button>
          )}
        </div>

        <div className="mt-2.5 px-0.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-editorial text-base font-semibold text-stone-900 dark:text-stone-100 truncate">
              {work.title}
            </h3>
            {work.isPrivate && <Lock className="w-3 h-3 text-stone-400 shrink-0" />}
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5 tabular-nums">
            {collectionLabel} · {work.createdAt}
          </p>
        </div>
      </div>
    );
  }

  // 3. MAGAZINE STREAM LAYOUT (Spacious slow-reading editorial plates)
  if (variant === 'magazine') {
    return (
      <article
        onClick={() => onSelect(work)}
        style={animStyle}
        className={`work-card-cv ${animClass} cursor-pointer group bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 rounded-2xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5`}
      >
        {work.type === 'photography' && work.imageData && !imgError && (
          <div className="w-full bg-stone-100 dark:bg-stone-900 overflow-hidden">
            <img
              src={work.imageData}
              alt={work.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full max-h-[540px] object-cover transition-transform duration-500 group-hover:scale-[1.01]"
            />
          </div>
        )}

        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 text-xs text-stone-500 dark:text-stone-400 mb-3">
            <span>
              {work.type === 'photography' ? '攝影作品' : work.writingGenre || '文字作品'} ·{' '}
              {collectionLabel} · <span className="tabular-nums">{work.createdAt}</span>
            </span>
            <div className="flex items-center gap-2">
              {work.isPrivate && <Lock className="w-3.5 h-3.5 text-stone-400" />}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => onToggleFavorite(work, e)}
                  aria-label={work.favorite ? '取消收藏' : '加入收藏'}
                  className="min-h-[40px] min-w-[40px] -mr-2 flex items-center justify-center rounded-full text-stone-400 hover:text-[#9E3B33] transition-colors"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      work.favorite ? 'fill-[#9E3B33] text-[#9E3B33] dark:fill-[#E07A70] dark:text-[#E07A70]' : ''
                    }`}
                  />
                </button>
              )}
            </div>
          </div>

          <h3 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
            {work.title}
          </h3>
          {work.subtitle && (
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">{work.subtitle}</p>
          )}

          {work.content && (
            <p className="text-[15px] leading-[1.8] text-stone-700 dark:text-stone-300 whitespace-pre-line line-clamp-5">
              {work.content}
            </p>
          )}

          {work.type === 'photography' && work.photoMeta?.camera && (
            <p className="mt-5 pt-4 border-t border-stone-100 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400 tabular-nums">
              {[
                work.photoMeta.camera,
                work.photoMeta.lens,
                work.photoMeta.film,
                work.photoMeta.location,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {work.tags.length > 0 && (
            <p className="mt-3 text-xs text-stone-400 dark:text-stone-500">
              {work.tags.map((t) => `#${t}`).join('  ')}
            </p>
          )}
        </div>
      </article>
    );
  }

  // 4. MASONRY LAYOUT (Default: natural aspect photos + warm paper text cards)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(work)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(work);
        }
      }}
      style={animStyle}
      className={`work-card-cv ${animClass} group cursor-pointer break-inside-avoid mb-5 bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 rounded-2xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]`}
    >
      {work.type === 'photography' && work.imageData && !imgError ? (
        <div className="relative overflow-hidden bg-stone-100 dark:bg-stone-900">
          <img
            src={work.imageData}
            alt={work.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-auto object-cover block transition-transform duration-300 group-hover:scale-[1.02]"
          />
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => onToggleFavorite(work, e)}
              aria-label={work.favorite ? '取消收藏' : '加入收藏'}
              className="absolute top-2.5 right-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50 transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${work.favorite ? 'fill-[#E07A70] text-[#E07A70]' : 'text-white'}`}
              />
            </button>
          )}
        </div>
      ) : null}

      <div className="p-5">
        <div className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400 mb-2">
          <span className="truncate">
            {work.type === 'photography' ? '攝影' : work.writingGenre || '文字'} · {collectionLabel}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {work.isPrivate && <Lock className="w-3.5 h-3.5 text-stone-400" />}
            {work.type === 'writing' && onToggleFavorite && (
              <button
                type="button"
                onClick={(e) => onToggleFavorite(work, e)}
                aria-label={work.favorite ? '取消收藏' : '加入收藏'}
                className="min-h-[36px] min-w-[36px] -my-2 -mr-2 flex items-center justify-center rounded-full text-stone-400 hover:text-[#9E3B33] transition-colors"
              >
                <Heart
                  className={`w-4 h-4 ${
                    work.favorite ? 'fill-[#9E3B33] text-[#9E3B33] dark:fill-[#E07A70] dark:text-[#E07A70]' : ''
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100 leading-snug mb-2">
          {work.title}
        </h3>

        {work.content && (
          <p
            className={`text-sm leading-[1.75] text-stone-600 dark:text-stone-300 whitespace-pre-line ${
              work.type === 'photography' ? 'line-clamp-3' : 'line-clamp-6'
            }`}
          >
            {work.content}
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-2 text-xs text-stone-400 dark:text-stone-500">
          <span className="truncate">
            {work.type === 'photography'
              ? work.photoMeta?.camera || work.photoMeta?.location || '底片紀實'
              : chapterCount > 0
              ? `共 ${chapterCount} 章 · ${charCount} 字`
              : `${charCount} 字`}
          </span>
          <span className="tabular-nums shrink-0">{work.createdAt}</span>
        </div>
      </div>

      {work.type === 'photography' && (!work.imageData || imgError) && (
        <div className="px-5 pb-4 flex items-center gap-2 text-xs text-stone-400">
          <Feather className="w-3.5 h-3.5" />
          <span>無影像預覽</span>
        </div>
      )}
    </div>
  );
});
WorkCard.displayName = 'WorkCard';
