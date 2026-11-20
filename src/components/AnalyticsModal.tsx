import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  List,
  PieChart,
  Tag,
} from 'lucide-react';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Collection, WorkItem } from '../types';
import { SlidingPill } from './SlidingPill';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  works: WorkItem[];
  collections: Collection[];
  conciseCopyMode?: boolean;
}

type SectionKey = 'period' | 'collections' | 'tags' | 'genres';
type DisplayMode = 'chart' | 'list';
type PeriodGranularity = 'day' | 'week' | 'month' | 'year';

const STANDARD_GENRES = [
  '現代詩',
  '散文隨筆',
  '手記',
  '短篇小說',
  '章節小說',
  '閱讀摘錄',
];

const SERIES_COLORS = [
  '#284152',
  '#9E3B33',
  '#5A7065',
  '#B48748',
  '#6E6359',
  '#4A6B82',
  '#8C5E58',
  '#556270',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseWorkLocalDate(work: WorkItem): Date {
  if (work.createdAt && /^\d{4}-\d{2}-\d{2}$/.test(work.createdAt)) {
    const [y, m, d] = work.createdAt.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const fallback = new Date(work.updatedAt || Date.now());
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Sun, 1 = Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

interface PeriodBucket {
  key: string;
  label: string;
  fullLabel: string;
  photo: number;
  writing: number;
  total: number;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  works,
  collections,
  conciseCopyMode = false,
}) => {
  useBodyScrollLock(isOpen);
  const { animationOverhaul } = useMotionPreferences();

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    period: true,
    collections: true,
    tags: true,
    genres: true,
  });

  const [viewMode, setViewMode] = useState<Record<SectionKey, DisplayMode>>({
    period: 'chart',
    collections: 'chart',
    tags: 'chart',
    genres: 'chart',
  });

  const [granularity, setGranularity] = useState<PeriodGranularity>('month');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [selectedCollectionKey, setSelectedCollectionKey] = useState<string | null>(null);
  const [showAllTagsChart, setShowAllTagsChart] = useState(false);
  const periodChartScrollRef = useRef<HTMLDivElement | null>(null);

  const toggleSection = (key: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllExpanded = (open: boolean) => {
    setExpanded({
      period: open,
      collections: open,
      tags: open,
      genres: open,
    });
  };

  const toggleDisplayMode = (key: SectionKey, mode: DisplayMode) => {
    setViewMode((prev) => ({ ...prev, [key]: mode }));
  };

  // Core overview statistics
  const overview = useMemo(() => {
    let photoCount = 0;
    let writingCount = 0;
    let sealedCount = 0;
    let totalChars = 0;
    const activeDates = new Set<string>();
    const activeCols = new Set<string>();
    const uniqueTags = new Set<string>();

    for (const w of works) {
      if (w.type === 'photography') photoCount += 1;
      else writingCount += 1;
      if (w.isPrivate && w.isSealed) {
        sealedCount += 1;
      } else {
        w.tags.forEach((t) => uniqueTags.add(t));
        if (w.type === 'writing') {
          if (w.writingGenre === '章節小說' && w.chapters?.length) {
            totalChars += w.chapters.reduce(
              (acc, ch) => acc + ch.content.replace(/\s+/g, '').length,
              0
            );
          } else {
            totalChars += (w.content || '').replace(/\s+/g, '').length;
          }
        }
      }
      activeDates.add(toYmd(parseWorkLocalDate(w)));
      if (w.collectionId) activeCols.add(w.collectionId);
    }

    return {
      total: works.length,
      photoCount,
      writingCount,
      sealedCount,
      totalChars,
      activeDays: activeDates.size,
      activeCollections: activeCols.size,
      uniqueTagCount: uniqueTags.size,
    };
  }, [works]);

  // Section 1: Period buckets (day / week / month / year)
  const periodBuckets = useMemo<PeriodBucket[]>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const bucketMap = new Map<string, { photo: number; writing: number }>();

    for (const w of works) {
      const dt = parseWorkLocalDate(w);
      let key = '';
      if (granularity === 'day') {
        key = toYmd(dt);
      } else if (granularity === 'week') {
        key = toYmd(getMondayOfWeek(dt));
      } else if (granularity === 'month') {
        key = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
      } else {
        key = `${dt.getFullYear()}`;
      }
      const cur = bucketMap.get(key) || { photo: 0, writing: 0 };
      if (w.type === 'photography') cur.photo += 1;
      else cur.writing += 1;
      bucketMap.set(key, cur);
    }

    const buckets: PeriodBucket[] = [];

    if (granularity === 'day') {
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = toYmd(d);
        const counts = bucketMap.get(key) || { photo: 0, writing: 0 };
        buckets.push({
          key,
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          fullLabel: key,
          photo: counts.photo,
          writing: counts.writing,
          total: counts.photo + counts.writing,
        });
      }
    } else if (granularity === 'week') {
      const currentMon = getMondayOfWeek(today);
      for (let i = 11; i >= 0; i--) {
        const mon = new Date(currentMon);
        mon.setDate(currentMon.getDate() - i * 7);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        const key = toYmd(mon);
        const counts = bucketMap.get(key) || { photo: 0, writing: 0 };
        buckets.push({
          key,
          label: `${mon.getMonth() + 1}/${mon.getDate()}`,
          fullLabel: `${mon.getFullYear()}/${pad2(mon.getMonth() + 1)}/${pad2(mon.getDate())} – ${pad2(
            sun.getMonth() + 1
          )}/${pad2(sun.getDate())}`,
          photo: counts.photo,
          writing: counts.writing,
          total: counts.photo + counts.writing,
        });
      }
    } else if (granularity === 'month') {
      for (let i = 11; i >= 0; i--) {
        const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${m.getFullYear()}-${pad2(m.getMonth() + 1)}`;
        const counts = bucketMap.get(key) || { photo: 0, writing: 0 };
        buckets.push({
          key,
          label: `${m.getMonth() + 1}月`,
          fullLabel: `${m.getFullYear()} 年 ${m.getMonth() + 1} 月`,
          photo: counts.photo,
          writing: counts.writing,
          total: counts.photo + counts.writing,
        });
      }
    } else {
      const yearKeys = new Set<number>([today.getFullYear()]);
      bucketMap.forEach((_, k) => {
        const yr = Number(k);
        if (!Number.isNaN(yr)) yearKeys.add(yr);
      });
      const minYear = Math.min(...Array.from(yearKeys));
      const maxYear = Math.max(...Array.from(yearKeys));
      for (let yr = minYear; yr <= maxYear; yr++) {
        const key = String(yr);
        const counts = bucketMap.get(key) || { photo: 0, writing: 0 };
        buckets.push({
          key,
          label: key,
          fullLabel: `${key} 年`,
          photo: counts.photo,
          writing: counts.writing,
          total: counts.photo + counts.writing,
        });
      }
    }

    return buckets;
  }, [works, granularity]);

  const activePeriodBucket = useMemo(() => {
    if (periodBuckets.length === 0) return null;
    if (selectedPeriodKey) {
      const found = periodBuckets.find((b) => b.key === selectedPeriodKey);
      if (found) return found;
    }
    const latestWithData = [...periodBuckets].reverse().find((b) => b.total > 0);
    return latestWithData || periodBuckets[periodBuckets.length - 1];
  }, [periodBuckets, selectedPeriodKey]);

  const periodMax = useMemo(
    () => Math.max(1, ...periodBuckets.map((b) => b.total)),
    [periodBuckets]
  );

  const periodRangeTotal = useMemo(
    () => periodBuckets.reduce((sum, b) => sum + b.total, 0),
    [periodBuckets]
  );

  // Ensure mobile horizontal chart defaults to showing the latest dates without clipping
  useEffect(() => {
    if (!isOpen || !expanded.period || viewMode.period !== 'chart') return;
    const el = periodChartScrollRef.current;
    if (!el) return;
    const raf = window.requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, expanded.period, viewMode.period, granularity, periodBuckets.length]);

  // Section 2: Collections statistics
  const collectionStats = useMemo(() => {
    const colIds = new Set(collections.map((c) => c.id));
    const counts = new Map<string, { photo: number; writing: number }>();

    for (const c of collections) {
      counts.set(c.id, { photo: 0, writing: 0 });
    }
    let uncollectedPhoto = 0;
    let uncollectedWriting = 0;

    for (const w of works) {
      if (w.collectionId && colIds.has(w.collectionId)) {
        const cur = counts.get(w.collectionId)!;
        if (w.type === 'photography') cur.photo += 1;
        else cur.writing += 1;
      } else {
        if (w.type === 'photography') uncollectedPhoto += 1;
        else uncollectedWriting += 1;
      }
    }

    const rows = collections.map((col, idx) => {
      const c = counts.get(col.id) || { photo: 0, writing: 0 };
      const total = c.photo + c.writing;
      return {
        key: col.id,
        name: col.name,
        photo: c.photo,
        writing: c.writing,
        total,
        pct: works.length > 0 ? Math.round((total / works.length) * 100) : 0,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        subcategoriesCount: col.categories?.length || 0,
      };
    });

    if (uncollectedPhoto + uncollectedWriting > 0) {
      const total = uncollectedPhoto + uncollectedWriting;
      rows.push({
        key: '__uncollected__',
        name: '未歸類作品',
        photo: uncollectedPhoto,
        writing: uncollectedWriting,
        total,
        pct: works.length > 0 ? Math.round((total / works.length) * 100) : 0,
        color: '#9C968E',
        subcategoriesCount: 0,
      });
    }

    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [works, collections]);

  const activeCollectionSlice = useMemo(() => {
    if (collectionStats.length === 0) return null;
    if (selectedCollectionKey) {
      const found = collectionStats.find((r) => r.key === selectedCollectionKey);
      if (found) return found;
    }
    return collectionStats[0];
  }, [collectionStats, selectedCollectionKey]);

  // Section 3: Tag usage frequency
  const tagStats = useMemo(() => {
    const map = new Map<string, number>();
    let untaggedCount = 0;
    let totalTagUsages = 0;

    for (const w of works) {
      if (w.isPrivate && w.isSealed) continue;
      if (w.tags.length === 0) {
        untaggedCount += 1;
      } else {
        for (const t of w.tags) {
          map.set(t, (map.get(t) || 0) + 1);
          totalTagUsages += 1;
        }
      }
    }

    const rows = Array.from(map.entries())
      .map(([tag, count]) => ({
        tag,
        count,
        pct: works.length > 0 ? Math.round((count / works.length) * 100) : 0,
      }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag, 'zh-Hant')));

    return {
      rows,
      maxCount: rows[0]?.count || 1,
      untaggedCount,
      totalTagUsages,
    };
  }, [works]);

  // Section 4: Writing genre counts
  const genreStats = useMemo(() => {
    const map = new Map<string, { count: number; chars: number }>();
    STANDARD_GENRES.forEach((g) => map.set(g, { count: 0, chars: 0 }));

    let writingTotal = 0;
    for (const w of works) {
      if (w.type !== 'writing') continue;
      writingTotal += 1;
      if (w.isPrivate && w.isSealed) {
        const cur = map.get('未解鎖私密文字') || { count: 0, chars: 0 };
        cur.count += 1;
        map.set('未解鎖私密文字', cur);
        continue;
      }
      const genre = (w.writingGenre || '').trim() || '未分類文體';
      const cur = map.get(genre) || { count: 0, chars: 0 };
      cur.count += 1;
      if (genre === '章節小說' && w.chapters?.length) {
        cur.chars += w.chapters.reduce((s, ch) => s + ch.content.replace(/\s+/g, '').length, 0);
      } else {
        cur.chars += (w.content || '').replace(/\s+/g, '').length;
      }
      map.set(genre, cur);
    }

    const rows = Array.from(map.entries())
      .filter(([genre, info]) => STANDARD_GENRES.includes(genre) || info.count > 0)
      .map(([genre, info], idx) => ({
        genre,
        count: info.count,
        chars: info.chars,
        pct: writingTotal > 0 ? Math.round((info.count / writingTotal) * 100) : 0,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);

    const maxCount = Math.max(1, ...rows.map((r) => r.count));
    return { rows, writingTotal, maxCount };
  }, [works]);

  const panelVariants = animationOverhaul
    ? {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 20 },
        transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 10 },
        transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
      };

  const sectionBodyTransition = animationOverhaul
    ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }
    : { duration: 0.14, ease: 'easeOut' as const };

  const contentSwapProps = animationOverhaul
    ? {
        initial: { opacity: 0, y: 8 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
        },
        exit: {
          opacity: 0,
          y: -5,
          transition: { duration: 0.1, ease: [0.4, 0, 1, 1] as const },
        },
      }
    : {
        initial: false as const,
        animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.08 } },
        exit: { opacity: 0, transition: { duration: 0.05 } },
      };

  const readoutSwapProps = animationOverhaul
    ? {
        initial: { opacity: 0, y: 4 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] as const },
        },
        exit: {
          opacity: 0,
          y: -4,
          transition: { duration: 0.09, ease: [0.4, 0, 1, 1] as const },
        },
      }
    : {
        initial: false as const,
        animate: { opacity: 1, y: 0, transition: { duration: 0.06 } },
        exit: { opacity: 0, transition: { duration: 0.04 } },
      };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={panelVariants.initial}
          animate={panelVariants.animate}
          exit={panelVariants.exit}
          transition={panelVariants.transition}
          data-no-swipe="true"
          className="fixed inset-0 z-50 bg-[#F7F6F2] dark:bg-[#111110] flex flex-col pt-safe"
        >
          {/* Sticky Top Bar */}
          <header className="px-4 sm:px-6 h-14 border-b border-stone-200/80 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#111110] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-2.5 -ml-2 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 inline-flex items-center gap-1 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回</span>
              </button>
              <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <BarChart3 className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] shrink-0" />
                <h2 className="font-editorial text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100 truncate">
                  典藏數據統計
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const anyOpen = Object.values(expanded).some(Boolean);
                  setAllExpanded(!anyOpen);
                }}
                className="min-h-[36px] px-3 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#191918] text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center gap-1 whitespace-nowrap"
              >
                {Object.values(expanded).some(Boolean) ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>全部收合</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>全部展開</span>
                  </>
                )}
              </button>
            </div>
          </header>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 pb-safe">
            <LayoutGroup id="analytics-modal">
            <div className="max-w-4xl mx-auto space-y-5 pb-10">
              {!conciseCopyMode && (
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  依本機離線資料庫即時運算生成，每個統計分類皆可獨立切換「圖表」或「條列」視角，並支援單獨收合以聚焦想查看的項目。
                </p>
              )}

              {overview.sealedCount > 0 && (
                <div className="px-4 py-2.5 rounded-xl bg-[#EFECE6]/80 dark:bg-[#1C1C1A] border border-stone-200/80 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-300">
                  含 {overview.sealedCount} 件未解鎖私密作品（創作日期與作品集已計入，標籤與文體將於解鎖金庫後完整計入）。
                </div>
              )}

              {/* Top Summary Strip */}
              <section
                aria-label="統計總覽摘要"
                className="grid grid-cols-2 sm:grid-cols-4 gap-3"
              >
                <div className="p-4 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800">
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">總收錄作品</div>
                  <div className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums mt-1">
                    {overview.total}
                  </div>
                  <div className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums mt-0.5">
                    攝影 {overview.photoCount} · 文字 {overview.writingCount}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800">
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">已用作品集</div>
                  <div className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums mt-1">
                    {overview.activeCollections}
                  </div>
                  <div className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums mt-0.5">
                    共建立 {collections.length} 個作品集
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800">
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">活躍創作天數</div>
                  <div className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums mt-1">
                    {overview.activeDays}
                  </div>
                  <div className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums mt-0.5">
                    涵蓋標籤 {overview.uniqueTagCount} 種
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800">
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">累計文字字數</div>
                  <div className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums mt-1">
                    {overview.totalChars.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums mt-0.5">
                    共 {overview.writingCount} 篇文字作品
                  </div>
                </div>
              </section>

              {/* CATEGORY 1: 分段期間新增作品 */}
              <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('period')}
                  aria-expanded={expanded.period}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                        分段期間新增作品
                      </h3>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={`period-sub-${granularity}-${periodRangeTotal}`}
                          {...readoutSwapProps}
                          className="text-xs text-stone-500 dark:text-stone-400 truncate tabular-nums"
                        >
                          {granularity === 'day'
                            ? '近 14 日'
                            : granularity === 'week'
                            ? '近 12 週'
                            : granularity === 'month'
                            ? '近 12 個月'
                            : '歷年累計'}{' '}
                          · 共新增 {periodRangeTotal} 件作品
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                      expanded.period ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded.period && (
                    <motion.div
                      key="period-body"
                      initial={animationOverhaul ? { opacity: 0, y: -10 } : { opacity: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animationOverhaul ? { opacity: 0, y: -8 } : { opacity: 0 }}
                      transition={sectionBodyTransition}
                      className="px-5 pb-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-4"
                    >
                      {/* Controls: Day/Week/Month/Year + Chart/List */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80">
                          {(
                            [
                              { id: 'day', label: '每日' },
                              { id: 'week', label: '每週' },
                              { id: 'month', label: '每月' },
                              { id: 'year', label: '每年' },
                            ] as { id: PeriodGranularity; label: string }[]
                          ).map((opt) => {
                            const active = granularity === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setGranularity(opt.id);
                                  setSelectedPeriodKey(null);
                                }}
                                className={`relative min-h-[34px] px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                  active
                                    ? 'text-stone-900 dark:text-stone-100'
                                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                                }`}
                              >
                                {active && <SlidingPill layoutId="analytics-granularity-pill" />}
                                <span className="relative z-10">{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80">
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('period', 'chart')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.period === 'chart'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.period === 'chart' && (
                              <SlidingPill layoutId="analytics-mode-period" />
                            )}
                            <BarChart3 className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">圖表</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('period', 'list')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.period === 'list'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.period === 'list' && (
                              <SlidingPill layoutId="analytics-mode-period" />
                            )}
                            <List className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">條列</span>
                          </button>
                        </div>
                      </div>

                      <AnimatePresence mode="wait" initial={false}>
                        {viewMode.period === 'chart' ? (
                          <motion.div
                            key={`period-chart-${granularity}`}
                            {...contentSwapProps}
                            className="space-y-3"
                          >
                            {/* Legend + Tapped Bar Readout */}
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs min-h-[20px]">
                              <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                  key={`period-readout-${granularity}-${activePeriodBucket?.key || 'none'}`}
                                  {...readoutSwapProps}
                                  className="text-stone-700 dark:text-stone-200 tabular-nums"
                                >
                                  {activePeriodBucket ? (
                                    <>
                                      <span className="font-semibold">{activePeriodBucket.fullLabel}</span>
                                      <span className="text-stone-400 mx-1.5">·</span>
                                      <span>共 {activePeriodBucket.total} 件</span>
                                      <span className="text-stone-400 mx-1">
                                        （攝影 {activePeriodBucket.photo} · 文字 {activePeriodBucket.writing}）
                                      </span>
                                    </>
                                  ) : null}
                                </motion.div>
                              </AnimatePresence>
                              <div className="flex items-center gap-3 text-[11px] text-stone-500 dark:text-stone-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#284152] dark:bg-[#6D8FA5]" />
                                  <span>攝影</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#9E3B33] dark:bg-[#D6786E]" />
                                  <span>文字</span>
                                </span>
                              </div>
                            </div>

                            {/* Column Chart (Horizontally scrollable on narrow screens so 2-digit dates never clip) */}
                            <div
                              ref={periodChartScrollRef}
                              className="pt-2 pb-1.5 px-2 rounded-xl bg-[#FAF9F6] dark:bg-[#141413] border border-stone-200/60 dark:border-stone-800/80 overflow-x-auto overscroll-x-contain"
                            >
                              <div className="h-44 min-w-full w-max flex items-end gap-1.5 sm:gap-2 px-1">
                                {periodBuckets.map((b, idx) => {
                                  const isActive = activePeriodBucket?.key === b.key;
                                  const totalPct = b.total > 0 ? Math.max(8, (b.total / periodMax) * 100) : 0;
                                  const photoShare = b.total > 0 ? (b.photo / b.total) * 100 : 0;
                                  const writingShare = b.total > 0 ? (b.writing / b.total) * 100 : 0;
                                  return (
                                    <button
                                      key={b.key}
                                      type="button"
                                      onClick={() => setSelectedPeriodKey(b.key)}
                                      className="flex-1 min-w-[44px] sm:min-w-[48px] h-full flex flex-col justify-end items-center group focus:outline-none shrink-0"
                                      title={`${b.fullLabel}: ${b.total} 件`}
                                    >
                                      <span
                                        className={`text-[10px] tabular-nums mb-1 transition-colors ${
                                          b.total > 0
                                            ? isActive
                                              ? 'text-stone-900 dark:text-stone-100 font-semibold'
                                              : 'text-stone-400 dark:text-stone-500'
                                            : 'text-transparent'
                                        }`}
                                      >
                                        {b.total}
                                      </span>
                                      <div className="w-full max-w-[26px] flex-1 flex items-end justify-center">
                                        {b.total > 0 ? (
                                          <motion.div
                                            initial={{ scaleY: 0 }}
                                            animate={{ scaleY: 1 }}
                                            transition={{
                                              duration: animationOverhaul ? 0.28 : 0.18,
                                              delay: animationOverhaul ? Math.min(idx, 6) * 0.015 : 0,
                                              ease: [0.22, 1, 0.36, 1],
                                            }}
                                            style={{
                                              height: `${totalPct}%`,
                                              transformOrigin: 'bottom',
                                            }}
                                            className={`w-full rounded-t-md overflow-hidden flex flex-col justify-end transition-opacity ${
                                              isActive
                                                ? 'ring-2 ring-stone-900/25 dark:ring-white/30 opacity-100'
                                                : 'opacity-85 group-hover:opacity-100'
                                            }`}
                                          >
                                            {b.writing > 0 && (
                                              <div
                                                style={{ height: `${writingShare}%` }}
                                                className="w-full bg-[#9E3B33] dark:bg-[#D6786E]"
                                              />
                                            )}
                                            {b.photo > 0 && (
                                              <div
                                                style={{ height: `${photoShare}%` }}
                                                className="w-full bg-[#284152] dark:bg-[#6D8FA5]"
                                              />
                                            )}
                                          </motion.div>
                                        ) : (
                                          <div className="w-full h-[3px] rounded-full bg-stone-200/80 dark:bg-stone-800" />
                                        )}
                                      </div>
                                      <span
                                        className={`text-[10px] sm:text-[11px] leading-tight mt-1.5 whitespace-nowrap tabular-nums ${
                                          isActive
                                            ? 'text-stone-900 dark:text-stone-100 font-semibold'
                                            : 'text-stone-400 dark:text-stone-500'
                                        }`}
                                      >
                                        {b.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key={`period-list-${granularity}`}
                            {...contentSwapProps}
                            className="divide-y divide-stone-100 dark:divide-stone-800/80"
                          >
                            {[...periodBuckets].reverse().map((b) => (
                              <div
                                key={b.key}
                                className="py-2.5 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-stone-800 dark:text-stone-200 tabular-nums">
                                    {b.fullLabel}
                                  </div>
                                  <div className="mt-1 h-1.5 w-full max-w-[200px] rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden flex">
                                    {b.photo > 0 && (
                                      <div
                                        style={{ width: `${(b.photo / periodMax) * 100}%` }}
                                        className="h-full bg-[#284152] dark:bg-[#6D8FA5]"
                                      />
                                    )}
                                    {b.writing > 0 && (
                                      <div
                                        style={{ width: `${(b.writing / periodMax) * 100}%` }}
                                        className="h-full bg-[#9E3B33] dark:bg-[#D6786E]"
                                      />
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0 tabular-nums">
                                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                                    {b.total} 件
                                  </span>
                                  <span className="text-[11px] text-stone-400 ml-2">
                                    攝 {b.photo} / 文 {b.writing}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* CATEGORY 2: 作品集統計 */}
              <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('collections')}
                  aria-expanded={expanded.collections}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                      <FolderKanban className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                        作品集統計
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-stone-400 truncate tabular-nums">
                        共 {collectionStats.length} 個分類 · 最多「
                        {collectionStats[0]?.name || '—'}」（{collectionStats[0]?.total ?? 0} 件）
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                      expanded.collections ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded.collections && (
                    <motion.div
                      key="collections-body"
                      initial={animationOverhaul ? { opacity: 0, y: -10 } : { opacity: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animationOverhaul ? { opacity: 0, y: -8 } : { opacity: 0 }}
                      transition={sectionBodyTransition}
                      className="px-5 pb-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                          總計 {works.length} 件作品分佈
                        </span>
                        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80">
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('collections', 'chart')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.collections === 'chart'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.collections === 'chart' && (
                              <SlidingPill layoutId="analytics-mode-collections" />
                            )}
                            <PieChart className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">圖表</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('collections', 'list')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.collections === 'list'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.collections === 'list' && (
                              <SlidingPill layoutId="analytics-mode-collections" />
                            )}
                            <List className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">條列</span>
                          </button>
                        </div>
                      </div>

                      {collectionStats.length === 0 ? (
                        <p className="text-xs text-stone-400 py-4 text-center">尚無作品集資料</p>
                      ) : (
                        <AnimatePresence mode="wait" initial={false}>
                          {viewMode.collections === 'chart' ? (
                            <motion.div
                              key="collections-chart"
                              {...contentSwapProps}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center"
                            >
                              {/* SVG Donut Ring */}
                              <div className="sm:col-span-5 flex flex-col items-center justify-center">
                                <div className="relative w-40 h-40">
                                  <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                                    <circle
                                      cx="60"
                                      cy="60"
                                      r="44"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="14"
                                      className="text-stone-100 dark:text-stone-800"
                                    />
                                    {(() => {
                                      const circ = 2 * Math.PI * 44;
                                      let accLen = 0;
                                      const totalNonZero = collectionStats.reduce((s, r) => s + r.total, 0);
                                      if (totalNonZero === 0) return null;
                                      return collectionStats.map((row) => {
                                        if (row.total === 0) return null;
                                        const segLen = (row.total / totalNonZero) * circ;
                                        const offset = -accLen;
                                        accLen += segLen;
                                        const selected = activeCollectionSlice?.key === row.key;
                                        return (
                                          <circle
                                            key={row.key}
                                            cx="60"
                                            cy="60"
                                            r="44"
                                            fill="none"
                                            stroke={row.color}
                                            strokeWidth={selected ? 17 : 14}
                                            strokeDasharray={`${Math.max(0, segLen - 1.5)} ${circ}`}
                                            strokeDashoffset={offset}
                                            onClick={() => setSelectedCollectionKey(row.key)}
                                            className="cursor-pointer transition-all duration-300"
                                          />
                                        );
                                      });
                                    })()}
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
                                    <AnimatePresence mode="wait" initial={false}>
                                      <motion.div
                                        key={`col-donut-readout-${activeCollectionSlice?.key || 'none'}`}
                                        {...readoutSwapProps}
                                        className="flex flex-col items-center justify-center"
                                      >
                                        <span className="text-[11px] text-stone-400 truncate max-w-[82px]">
                                          {activeCollectionSlice?.name || '全部'}
                                        </span>
                                        <span className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
                                          {activeCollectionSlice?.total ?? 0} 件
                                        </span>
                                        <span className="text-[10px] text-stone-500 tabular-nums">
                                          {activeCollectionSlice?.pct ?? 0}%
                                        </span>
                                      </motion.div>
                                    </AnimatePresence>
                                  </div>
                                </div>
                              </div>

                              {/* Horizontal Ranked Bars */}
                              <div className="sm:col-span-7 space-y-2.5">
                                {collectionStats.map((row, idx) => {
                                  const maxCol = Math.max(1, collectionStats[0]?.total || 1);
                                  const widthPct = row.total > 0 ? Math.max(4, (row.total / maxCol) * 100) : 0;
                                  const isSelected = activeCollectionSlice?.key === row.key;
                                  return (
                                    <button
                                      key={row.key}
                                      type="button"
                                      onClick={() => setSelectedCollectionKey(row.key)}
                                      className={`w-full text-left p-2 -mx-2 rounded-xl transition-colors ${
                                        isSelected
                                          ? 'bg-[#F7F6F2] dark:bg-[#222220]'
                                          : 'hover:bg-stone-50 dark:hover:bg-stone-800/30'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                                        <span className="inline-flex items-center gap-2 min-w-0 font-medium text-stone-800 dark:text-stone-200">
                                          <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: row.color }}
                                          />
                                          <span className="truncate">{row.name}</span>
                                        </span>
                                        <span className="tabular-nums text-stone-600 dark:text-stone-300 shrink-0">
                                          <strong>{row.total}</strong> 件 ({row.pct}%)
                                        </span>
                                      </div>
                                      <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                                        <motion.div
                                          initial={{ scaleX: 0 }}
                                          animate={{ scaleX: 1 }}
                                          transition={{
                                            duration: animationOverhaul ? 0.3 : 0.2,
                                            delay: animationOverhaul ? Math.min(idx, 6) * 0.02 : 0,
                                            ease: [0.22, 1, 0.36, 1],
                                          }}
                                          style={{
                                            width: `${widthPct}%`,
                                            backgroundColor: row.color,
                                            transformOrigin: 'left',
                                          }}
                                          className="h-full rounded-full"
                                        />
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="collections-list"
                              {...contentSwapProps}
                              className="divide-y divide-stone-100 dark:divide-stone-800/80"
                            >
                              {collectionStats.map((row, idx) => (
                                <div
                                  key={row.key}
                                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-[11px] tabular-nums text-stone-400 w-5 shrink-0">
                                      {String(idx + 1).padStart(2, '0')}
                                    </span>
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: row.color }}
                                    />
                                    <div className="min-w-0">
                                      <div className="font-medium text-stone-800 dark:text-stone-200 truncate">
                                        {row.name}
                                      </div>
                                      <div className="text-[11px] text-stone-400 tabular-nums">
                                        攝影 {row.photo} · 文字 {row.writing}
                                        {row.subcategoriesCount > 0 ? ` · ${row.subcategoriesCount} 子分類` : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 tabular-nums">
                                    <span className="font-semibold text-stone-900 dark:text-stone-100">
                                      {row.total} 件
                                    </span>
                                    <span className="text-[11px] text-stone-400 ml-1.5">{row.pct}%</span>
                                  </div>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* CATEGORY 3: 標籤使用次數 */}
              <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('tags')}
                  aria-expanded={expanded.tags}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                        標籤使用次數
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-stone-400 truncate tabular-nums">
                        共 {tagStats.rows.length} 個標籤 · 累計標記 {tagStats.totalTagUsages} 次
                        {tagStats.rows[0] ? ` · 最常用 #${tagStats.rows[0].tag}` : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                      expanded.tags ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded.tags && (
                    <motion.div
                      key="tags-body"
                      initial={animationOverhaul ? { opacity: 0, y: -10 } : { opacity: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animationOverhaul ? { opacity: 0, y: -8 } : { opacity: 0 }}
                      transition={sectionBodyTransition}
                      className="px-5 pb-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                          {tagStats.untaggedCount > 0
                            ? `另有 ${tagStats.untaggedCount} 件尚未加上標籤`
                            : '所有已解鎖作品皆已加上標籤'}
                        </span>
                        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80">
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('tags', 'chart')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.tags === 'chart'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.tags === 'chart' && (
                              <SlidingPill layoutId="analytics-mode-tags" />
                            )}
                            <BarChart3 className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">圖表</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('tags', 'list')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.tags === 'list'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.tags === 'list' && (
                              <SlidingPill layoutId="analytics-mode-tags" />
                            )}
                            <List className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">條列</span>
                          </button>
                        </div>
                      </div>

                      {tagStats.rows.length === 0 ? (
                        <p className="text-xs text-stone-400 py-4 text-center">尚未有任何標籤使用紀錄</p>
                      ) : (
                        <AnimatePresence mode="wait" initial={false}>
                          {viewMode.tags === 'chart' ? (
                            <motion.div
                              key="tags-chart"
                              {...contentSwapProps}
                              className="space-y-3"
                            >
                              <div className="space-y-2.5">
                                {(showAllTagsChart ? tagStats.rows : tagStats.rows.slice(0, 10)).map(
                                  (row, idx) => {
                                    const widthPct = Math.max(6, (row.count / tagStats.maxCount) * 100);
                                    return (
                                      <div key={row.tag} className="space-y-1">
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                          <span className="font-medium text-stone-800 dark:text-stone-200 truncate">
                                            #{row.tag}
                                          </span>
                                          <span className="tabular-nums text-stone-600 dark:text-stone-300 shrink-0">
                                            <strong>{row.count}</strong> 次 ({row.pct}%)
                                          </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                                          <motion.div
                                            initial={{ scaleX: 0 }}
                                            animate={{ scaleX: 1 }}
                                            transition={{
                                              duration: animationOverhaul ? 0.28 : 0.2,
                                              delay: animationOverhaul ? Math.min(idx, 6) * 0.018 : 0,
                                              ease: [0.22, 1, 0.36, 1],
                                            }}
                                            style={{
                                              width: `${widthPct}%`,
                                              transformOrigin: 'left',
                                            }}
                                            className="h-full rounded-full bg-[#284152] dark:bg-[#8BA9BE]"
                                          />
                                        </div>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                              {tagStats.rows.length > 10 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllTagsChart((s) => !s)}
                                  className="text-xs font-medium text-[#284152] dark:text-stone-300 hover:underline"
                                >
                                  {showAllTagsChart
                                    ? '收合僅顯示前 10 名'
                                    : `展開顯示全部 ${tagStats.rows.length} 個標籤`}
                                </button>
                              )}
                            </motion.div>
                          ) : (
                            <motion.div
                              key="tags-list"
                              {...contentSwapProps}
                              className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-stone-100 dark:divide-stone-800/80"
                            >
                              {tagStats.rows.map((row, idx) => (
                                <div
                                  key={row.tag}
                                  className="py-2 sm:border-b sm:border-stone-100 sm:dark:border-stone-800/80 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[11px] tabular-nums text-stone-400 w-5 shrink-0">
                                      {String(idx + 1).padStart(2, '0')}
                                    </span>
                                    <span className="font-medium text-stone-800 dark:text-stone-200 truncate">
                                      #{row.tag}
                                    </span>
                                  </div>
                                  <span className="tabular-nums text-stone-600 dark:text-stone-300 shrink-0">
                                    <strong className="text-stone-900 dark:text-stone-100">
                                      {row.count}
                                    </strong>{' '}
                                    次 · {row.pct}%
                                  </span>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* CATEGORY 4: 作品各文體數量 */}
              <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('genres')}
                  aria-expanded={expanded.genres}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                        作品各文體數量
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-stone-400 truncate tabular-nums">
                        文字作品共 {genreStats.writingTotal} 篇
                        {genreStats.rows[0] && genreStats.rows[0].count > 0
                          ? ` · 最多「${genreStats.rows[0].genre}」（${genreStats.rows[0].count} 篇）`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                      expanded.genres ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded.genres && (
                    <motion.div
                      key="genres-body"
                      initial={animationOverhaul ? { opacity: 0, y: -10 } : { opacity: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animationOverhaul ? { opacity: 0, y: -8 } : { opacity: 0 }}
                      transition={sectionBodyTransition}
                      className="px-5 pb-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                          統計範圍：{genreStats.writingTotal} 篇文字作品（另含 {overview.photoCount} 件攝影作品）
                        </span>
                        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80">
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('genres', 'chart')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.genres === 'chart'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.genres === 'chart' && (
                              <SlidingPill layoutId="analytics-mode-genres" />
                            )}
                            <BarChart3 className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">圖表</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDisplayMode('genres', 'list')}
                            className={`relative min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                              viewMode.genres === 'list'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {viewMode.genres === 'list' && (
                              <SlidingPill layoutId="analytics-mode-genres" />
                            )}
                            <List className="w-3.5 h-3.5 relative z-10" />
                            <span className="relative z-10">條列</span>
                          </button>
                        </div>
                      </div>

                      <AnimatePresence mode="wait" initial={false}>
                        {viewMode.genres === 'chart' ? (
                          <motion.div
                            key="genres-chart"
                            {...contentSwapProps}
                            className="space-y-4"
                          >
                            {/* Stacked Proportion Bar */}
                            {genreStats.writingTotal > 0 && (
                              <div className="h-3 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden flex gap-0.5">
                                {genreStats.rows.map((row) =>
                                  row.count > 0 ? (
                                    <div
                                      key={row.genre}
                                      style={{
                                        width: `${(row.count / genreStats.writingTotal) * 100}%`,
                                        backgroundColor: row.color,
                                      }}
                                      title={`${row.genre}: ${row.count} 篇 (${row.pct}%)`}
                                      className="h-full transition-all duration-300"
                                    />
                                  ) : null
                                )}
                              </div>
                            )}

                            <div className="space-y-2.5">
                              {genreStats.rows.map((row, idx) => {
                                const widthPct =
                                  row.count > 0 ? Math.max(5, (row.count / genreStats.maxCount) * 100) : 0;
                                return (
                                  <div key={row.genre} className="space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="inline-flex items-center gap-2 font-medium text-stone-800 dark:text-stone-200">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0"
                                          style={{ backgroundColor: row.color }}
                                        />
                                        <span>{row.genre}</span>
                                      </span>
                                      <span className="tabular-nums text-stone-600 dark:text-stone-300">
                                        <strong>{row.count}</strong> 篇 ({row.pct}%)
                                      </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                                      {row.count > 0 && (
                                        <motion.div
                                          initial={{ scaleX: 0 }}
                                          animate={{ scaleX: 1 }}
                                          transition={{
                                            duration: animationOverhaul ? 0.28 : 0.2,
                                            delay: animationOverhaul ? Math.min(idx, 6) * 0.02 : 0,
                                            ease: [0.22, 1, 0.36, 1],
                                          }}
                                          style={{
                                            width: `${widthPct}%`,
                                            backgroundColor: row.color,
                                            transformOrigin: 'left',
                                          }}
                                          className="h-full rounded-full"
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="genres-list"
                            {...contentSwapProps}
                            className="divide-y divide-stone-100 dark:divide-stone-800/80"
                          >
                            {genreStats.rows.map((row) => (
                              <div
                                key={row.genre}
                                className="py-2.5 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: row.color }}
                                  />
                                  <span className="font-medium text-stone-800 dark:text-stone-200">
                                    {row.genre}
                                  </span>
                                  {row.chars > 0 && (
                                    <span className="text-[11px] text-stone-400 tabular-nums">
                                      · 累計 {row.chars.toLocaleString()} 字
                                    </span>
                                  )}
                                </div>
                                <div className="tabular-nums text-right shrink-0">
                                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                                    {row.count} 篇
                                  </span>
                                  <span className="text-[11px] text-stone-400 ml-1.5">{row.pct}%</span>
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>
            </LayoutGroup>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
