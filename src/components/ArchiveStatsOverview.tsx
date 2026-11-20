import React, { useMemo } from 'react';
import { WorkItem } from '../types';

interface ArchiveStatsOverviewProps {
  works: WorkItem[];
}

export const ArchiveStatsOverview: React.FC<ArchiveStatsOverviewProps> = ({ works }) => {
  const stats = useMemo(() => {
    const now = new Date();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')}`;
    const startOfTodayMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    let photoCount = 0;
    let writingCount = 0;
    let latestDate = '';
    let todayCount = 0;

    for (const w of works) {
      if (w.type === 'photography') photoCount += 1;
      else writingCount += 1;

      if (w.createdAt && (!latestDate || w.createdAt > latestDate)) {
        latestDate = w.createdAt;
      }

      if (w.createdAt === todayYmd || w.updatedAt >= startOfTodayMs) {
        todayCount += 1;
      }
    }

    return {
      photoCount,
      writingCount,
      latestDate: latestDate || '—',
      todayCount,
    };
  }, [works]);

  const cards = [
    { label: '總攝影', value: `${stats.photoCount} 張` },
    { label: '總文字', value: `${stats.writingCount} 篇` },
    { label: '最近收錄', value: stats.latestDate },
    { label: '今日累計', value: `${stats.todayCount} 件` },
  ];

  return (
    <section aria-label="作品集數據概覽" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-2"
        >
          <span className="text-[11px] text-stone-500 dark:text-stone-400 whitespace-nowrap">
            {card.label}
          </span>
          <span className="text-xs sm:text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-100 truncate">
            {card.value}
          </span>
        </div>
      ))}
    </section>
  );
};
