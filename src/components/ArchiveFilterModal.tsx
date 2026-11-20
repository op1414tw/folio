import React from 'react';
import {
  BookOpen,
  Grid,
  LayoutGrid,
  List,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Collection, LayoutMode } from '../types';
import { BottomSheet } from './BottomSheet';
import { SlidingPill } from './SlidingPill';

export type SortOrder = 'newest' | 'oldest' | 'title';

interface ArchiveFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  resultCount: number;
  layout: LayoutMode;
  onChangeLayout: (layout: LayoutMode) => void;
  collections: Collection[];
  selectedCollectionId: string;
  onChangeCollectionId: (id: string) => void;
  selectedCategory: string;
  onChangeCategory: (cat: string) => void;
  availableCategories: string[];
  selectedGenre: string;
  onChangeGenre: (genre: string) => void;
  availableGenres: string[];
  selectedTag: string;
  onChangeTag: (tag: string) => void;
  availableTags: string[];
  selectedPeriod: string;
  onChangePeriod: (period: string) => void;
  availableYears: string[];
  availableMonths: string[];
  sortOrder: SortOrder;
  onChangeSortOrder: (sort: SortOrder) => void;
  onResetFilters: () => void;
  conciseCopyMode?: boolean;
}

export const ArchiveFilterModal: React.FC<ArchiveFilterModalProps> = ({
  isOpen,
  onClose,
  resultCount,
  layout,
  onChangeLayout,
  collections,
  selectedCollectionId,
  onChangeCollectionId,
  selectedCategory,
  onChangeCategory,
  availableCategories,
  selectedGenre,
  onChangeGenre,
  availableGenres,
  selectedTag,
  onChangeTag,
  availableTags,
  selectedPeriod,
  onChangePeriod,
  availableYears,
  availableMonths,
  sortOrder,
  onChangeSortOrder,
  onResetFilters,
  conciseCopyMode = false,
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      backdropToneClass="bg-black/45"
      maxWidthClass="sm:max-w-lg"
      panelClassName="max-h-[90vh] bg-[#F7F6F2] dark:bg-[#171716] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
    >
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0]" />
                <h2 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                  檢視排版與篩選器
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉篩選器"
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-5">
              {/* SECTION 1: 排列與排版 (Clearly Separated Zone) */}
              <section className="p-4 rounded-2xl bg-white/80 dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2">
                  <span className="text-xs font-semibold tracking-wide text-stone-800 dark:text-stone-200">
                    排列與排版
                  </span>
                  {!conciseCopyMode && (
                    <span className="text-[11px] text-stone-400">版面檢視方式</span>
                  )}
                </div>

                {/* Layout Mode */}
                <div>
                  <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                    排版樣式
                  </label>
                  <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#252523]">
                    {(
                      [
                        { id: 'masonry', label: '瀑布流', icon: LayoutGrid },
                        { id: 'grid', label: '畫廊', icon: Grid },
                        { id: 'index', label: '清單', icon: List },
                        { id: 'magazine', label: '雜誌', icon: BookOpen },
                        { id: 'map', label: '地圖', icon: MapPin },
                      ] as {
                        id: LayoutMode;
                        label: string;
                        icon: React.ComponentType<{ className?: string }>;
                      }[]
                    ).map((mode) => {
                      const Icon = mode.icon;
                      const active = layout === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => onChangeLayout(mode.id)}
                          className={`relative min-h-[40px] px-1 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors ${
                            active
                              ? 'text-stone-900 dark:text-stone-100'
                              : 'text-stone-500 dark:text-stone-400 hover:text-stone-800'
                          }`}
                        >
                          {active && (
                            <SlidingPill
                              layoutId="filter-layout-pill"
                              className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                            />
                          )}
                          <Icon className="w-3.5 h-3.5 shrink-0 relative z-10" />
                          <span className="truncate relative z-10">{mode.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                    排序順序
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#252523]">
                    {(
                      [
                        { id: 'newest', label: '最新建立' },
                        { id: 'oldest', label: '最早建立' },
                        { id: 'title', label: '依標題排列' },
                      ] as { id: SortOrder; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangeSortOrder(opt.id)}
                        className={`relative min-h-[38px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                          sortOrder === opt.id
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400'
                        }`}
                      >
                        {sortOrder === opt.id && (
                          <SlidingPill
                            layoutId="filter-sort-pill"
                            className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                          />
                        )}
                        <span className="relative z-10">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* SECTION 2: 作品篩選條件 (Clearly Separated Zone) */}
              <section className="p-4 rounded-2xl bg-white/80 dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 space-y-5">
                <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2">
                  <span className="text-xs font-semibold tracking-wide text-stone-800 dark:text-stone-200">
                    作品篩選條件
                  </span>
                  {!conciseCopyMode && (
                    <span className="text-[11px] text-stone-400">依文體、分類與時間過濾</span>
                  )}
                </div>

                {/* Writing Genre Filter */}
                <div>
                  <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                    文字作品文體
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onChangeGenre('all')}
                      className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border transition-colors ${
                        selectedGenre === 'all'
                          ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                          : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#222220] text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      全部文體
                    </button>
                    {availableGenres.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => onChangeGenre(genre)}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border transition-colors ${
                          selectedGenre === genre
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                            : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#222220] text-stone-600 dark:text-stone-300'
                        }`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Collection & Sub-category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                      作品集
                    </label>
                    <select
                      value={selectedCollectionId}
                      onChange={(e) => onChangeCollectionId(e.target.value)}
                      aria-label="依作品集篩選"
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200 focus:outline-none"
                    >
                      <option value="all">所有作品集</option>
                      <option value="__none__">未加入作品集</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                      作品集子分類
                    </label>
                    {selectedCollectionId !== 'all' &&
                    selectedCollectionId !== '__none__' &&
                    availableCategories.length > 0 ? (
                      <select
                        value={selectedCategory}
                        onChange={(e) => onChangeCategory(e.target.value)}
                        aria-label="依作品集子分類篩選"
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200 focus:outline-none"
                      >
                        <option value="all">全部子分類</option>
                        {availableCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        disabled
                        value="all"
                        className="w-full min-h-[42px] px-3 rounded-xl bg-stone-100/80 dark:bg-[#191918] border border-stone-200/70 dark:border-stone-800 text-xs text-stone-400 cursor-not-allowed"
                      >
                        <option value="all">
                          {selectedCollectionId === 'all' || selectedCollectionId === '__none__'
                            ? '選擇特定作品集後啟用'
                            : '此作品集無子分類'}
                        </option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Tags Filter */}
                {availableTags.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                      作品標籤
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onChangeTag('all')}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border transition-colors ${
                          selectedTag === 'all'
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                            : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#222220] text-stone-600 dark:text-stone-300'
                        }`}
                      >
                        全部標籤
                      </button>
                      {availableTags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => onChangeTag(t)}
                          className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border transition-colors ${
                            selectedTag === t
                              ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                              : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#222220] text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline Period & Scrubber */}
                {availableMonths.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-stone-500 dark:text-stone-400">
                        創作時間跨度
                      </label>
                      <select
                        value={selectedPeriod}
                        onChange={(e) => onChangePeriod(e.target.value)}
                        aria-label="依時間跨度篩選"
                        className="min-h-[36px] px-3 rounded-lg bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 tabular-nums"
                      >
                        <option value="all">全部時間</option>
                        {availableYears.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr} 全年
                          </option>
                        ))}
                        {availableMonths
                          .slice()
                          .reverse()
                          .map((ym) => (
                            <option key={ym} value={ym}>
                              {ym.replace('-', '.')} 月份
                            </option>
                          ))}
                      </select>
                    </div>

                    {availableMonths.length > 1 && (
                      <div className="px-3.5 py-2.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-stone-400 tabular-nums">
                          <span>{availableMonths[0].replace('-', '.')}</span>
                          <span className="font-semibold text-[#284152] dark:text-[#E7E5E0]">
                            {selectedPeriod === 'all'
                              ? '全部時間'
                              : selectedPeriod.length === 4
                              ? `${selectedPeriod} 全年`
                              : selectedPeriod.replace('-', '.')}
                          </span>
                          <span>
                            {availableMonths[availableMonths.length - 1].replace('-', '.')}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={availableMonths.length}
                          step={1}
                          value={
                            selectedPeriod === 'all'
                              ? 0
                              : Math.max(
                                  0,
                                  availableMonths.indexOf(selectedPeriod.slice(0, 7)) + 1
                                )
                          }
                          onChange={(e) => {
                            const idx = Number(e.target.value);
                            onChangePeriod(idx === 0 ? 'all' : availableMonths[idx - 1]);
                          }}
                          aria-label="時間軸月份滑桿"
                          className="w-full accent-[#284152] dark:accent-[#E7E5E0]"
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 pb-safe border-t border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0 bg-[#F7F6F2] dark:bg-[#171716]">
              <button
                type="button"
                onClick={onResetFilters}
                className="min-h-[42px] px-3.5 rounded-xl text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重設篩選條件</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium tabular-nums hover:opacity-90 transition-opacity"
              >
                套用並查看（{resultCount} 件）
              </button>
            </div>
    </BottomSheet>
  );
};
