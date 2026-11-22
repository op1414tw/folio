import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileDown,
  Layers,
  RotateCcw,
  X,
} from 'lucide-react';
import { MAX_EXPORT_QUEUE_SIZE, useExportQueue } from '../contexts/ExportQueueContext';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBackHandler } from '../hooks/useBackHandler';
import {
  exportWorksAsPdfEbook,
  PdfFontStyle,
  PdfPageSize,
  PdfPaperTone,
  PdfSectionGroupInput,
  PdfSubGroupInput,
} from '../services/pdfEbook';
import { Collection, WorkItem } from '../types';
import { BottomSheet } from './BottomSheet';
import { SlidingPill } from './SlidingPill';
import { SmoothCollapse } from './SmoothCollapse';

interface PdfEbookModalProps {
  isOpen: boolean;
  works: WorkItem[];
  collections: Collection[];
  authorName: string;
  sealText: string;
  initialCollectionId?: string;
  onClose: () => void;
}

export const PdfEbookModal: React.FC<PdfEbookModalProps> = ({
  isOpen,
  works,
  collections,
  authorName,
  sealText,
  initialCollectionId,
  onClose,
}) => {
  const { animationOverhaul } = useMotionPreferences();
  const { activeTask, queuedTasks, lastNotice, enqueueTask } = useExportQueue();

  const unlockedWorks = useMemo(
    () => works.filter((w) => !(w.isPrivate && w.isSealed)),
    [works]
  );

  const [sourceMode, setSourceMode] = useState<'collection' | 'custom'>('collection');
  const [targetCollectionId, setTargetCollectionId] = useState<string>('all');
  const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>([]);
  const [pickFilter, setPickFilter] = useState<'all' | 'writing' | 'photography'>('all');

  const [bookTitle, setBookTitle] = useState('');
  const [bookSubtitle, setBookSubtitle] = useState('');
  const [pageSize, setPageSize] = useState<PdfPageSize>('a5');
  const [paperTone, setPaperTone] = useState<PdfPaperTone>('ivory');
  const [fontStyle, setFontStyle] = useState<PdfFontStyle>('editorial');
  const [includeCover, setIncludeCover] = useState(true);
  const [includeSectionDividers, setIncludeSectionDividers] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [showStructureConfig, setShowStructureConfig] = useState(false);
  const [includeSubtitle, setIncludeSubtitle] = useState(true);
  const [includeGenre, setIncludeGenre] = useState(true);
  const [includeCollection, setIncludeCollection] = useState(true);
  const [includeDate, setIncludeDate] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [includeExif, setIncludeExif] = useState(true);

  // Unobtrusive work ordering & collection/subcategory grouping sub-page state
  const [showOrderSubPage, setShowOrderSubPage] = useState(false);
  useBackHandler(isOpen && showOrderSubPage, () => setShowOrderSubPage(false));
  const [groupByCollection, setGroupByCollection] = useState(false);
  const [groupSubcategoriesInCollection, setGroupSubcategoriesInCollection] = useState(false);
  const [customFlatOrderIds, setCustomFlatOrderIds] = useState<string[]>([]);
  const [customGroupOrderKeys, setCustomGroupOrderKeys] = useState<string[]>([]);
  const [customGroupWorkOrderMap, setCustomGroupWorkOrderMap] = useState<Record<string, string[]>>({});
  const [customSubGroupOrderMap, setCustomSubGroupOrderMap] = useState<Record<string, string[]>>({});
  const [customSubGroupWorkOrderMap, setCustomSubGroupWorkOrderMap] = useState<Record<string, string[]>>({});

  const [lastSubmittedAt, setLastSubmittedAt] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const queuedPdfCount = useMemo(
    () => queuedTasks.filter((t) => t.kind === 'pdf').length,
    [queuedTasks]
  );

  useEffect(() => {
    if (!lastNotice || lastSubmittedAt === 0) return;
    if (lastNotice.kind === 'pdf' && lastNotice.finishedAt >= lastSubmittedAt) {
      setFeedback({
        type: lastNotice.status === 'success' ? 'success' : 'error',
        text: lastNotice.message,
      });
    }
  }, [lastNotice, lastSubmittedAt]);

  const wasOpenRef = useRef(false);
  const initColRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      initColRef.current = undefined;
      return;
    }
    if (wasOpenRef.current && initColRef.current === initialCollectionId) {
      return;
    }
    wasOpenRef.current = true;
    initColRef.current = initialCollectionId;

    setFeedback(null);
    setShowOrderSubPage(false);
    setShowStructureConfig(false);
    setGroupByCollection(false);
    setGroupSubcategoriesInCollection(false);
    setSourceMode('collection');

    if (initialCollectionId) {
      setTargetCollectionId(initialCollectionId);
      const col = collections.find((c) => c.id === initialCollectionId);
      setBookTitle(col?.name || '拾光卷宗選輯');
      setBookSubtitle(col?.description || '');
    } else {
      setTargetCollectionId('all');
      setBookTitle(`${authorName || '個人'}典藏電子讀本`);
      setBookSubtitle('離線攝影與文字作品精選集');
    }
    const unlockedIds = unlockedWorks.map((w) => w.id);
    setSelectedWorkIds(unlockedIds);
    setCustomFlatOrderIds(unlockedIds);
    setCustomGroupOrderKeys([]);
    setCustomGroupWorkOrderMap({});
    setCustomSubGroupOrderMap({});
    setCustomSubGroupWorkOrderMap({});
  }, [isOpen, initialCollectionId, collections, authorName, unlockedWorks]);

  const handleCollectionSelectChange = (colId: string) => {
    setTargetCollectionId(colId);
    if (colId === 'all') {
      setBookTitle(`${authorName || '個人'}典藏電子讀本`);
      setBookSubtitle('離線攝影與文字作品精選集');
    } else if (colId === '__none__') {
      setBookTitle('未歸類作品散輯');
      setBookSubtitle('');
    } else {
      const col = collections.find((c) => c.id === colId);
      if (col) {
        setBookTitle(col.name);
        setBookSubtitle(col.description || '');
      }
    }
  };

  const collectionFilteredWorks = useMemo(() => {
    if (targetCollectionId === 'all') return unlockedWorks;
    if (targetCollectionId === '__none__') {
      return unlockedWorks.filter(
        (w) => !w.collectionId || !collections.some((c) => c.id === w.collectionId)
      );
    }
    return unlockedWorks.filter((w) => w.collectionId === targetCollectionId);
  }, [unlockedWorks, targetCollectionId, collections]);

  const pickerWorks = useMemo(() => {
    if (pickFilter === 'all') return unlockedWorks;
    return unlockedWorks.filter((w) => w.type === pickFilter);
  }, [unlockedWorks, pickFilter]);

  const baseWorksToExport = useMemo(() => {
    if (sourceMode === 'collection') return collectionFilteredWorks;
    const idSet = new Set(selectedWorkIds);
    return unlockedWorks.filter((w) => idSet.has(w.id));
  }, [sourceMode, collectionFilteredWorks, unlockedWorks, selectedWorkIds]);

  const flatOrderedWorks = useMemo(() => {
    const rank = new Map<string, number>();
    customFlatOrderIds.forEach((id, idx) => rank.set(id, idx));
    return [...baseWorksToExport].sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return 0;
    });
  }, [baseWorksToExport, customFlatOrderIds]);

  interface DerivedPdfSubGroup {
    key: string;
    title: string;
    isNamedCategory: boolean;
    works: WorkItem[];
  }

  interface DerivedPdfGroup {
    key: string;
    title: string;
    subtitle?: string;
    kind: 'collection' | 'subcategory';
    hasSubcategories: boolean;
    subcategoriesOrder: string[];
    works: WorkItem[];
    subGroups?: DerivedPdfSubGroup[];
  }

  const multiColHasSubcategories = useMemo(() => {
    const colMap = new Map(collections.map((c) => [c.id, c]));
    const distinctCols = new Set(
      baseWorksToExport.map((w) =>
        w.collectionId && colMap.has(w.collectionId) ? w.collectionId : '__none__'
      )
    );
    if (distinctCols.size <= 1) return false;
    return baseWorksToExport.some((w) => Boolean(w.category));
  }, [baseWorksToExport, collections]);

  const groupedSections = useMemo<DerivedPdfGroup[]>(() => {
    const colMap = new Map(collections.map((c) => [c.id, c]));
    const distinctCols = new Set(
      baseWorksToExport.map((w) =>
        w.collectionId && colMap.has(w.collectionId) ? w.collectionId : '__none__'
      )
    );
    const singleColMode = distinctCols.size === 1;
    const bucketMap = new Map<string, DerivedPdfGroup>();

    for (const w of baseWorksToExport) {
      const validCol = w.collectionId ? colMap.get(w.collectionId) : undefined;
      const key = singleColMode
        ? `${validCol?.id || '__none__'}::${w.category || '__uncat__'}`
        : validCol
        ? validCol.id
        : '__none__';

      let grp = bucketMap.get(key);
      if (!grp) {
        grp = {
          key,
          title: singleColMode
            ? w.category || '未指定子分類'
            : validCol
            ? validCol.name
            : '未加入作品集',
          subtitle: singleColMode ? validCol?.name : validCol?.description,
          kind: singleColMode ? 'subcategory' : 'collection',
          hasSubcategories: false,
          subcategoriesOrder: validCol?.categories || [],
          works: [],
        };
        bucketMap.set(key, grp);
      }
      if (w.category) grp.hasSubcategories = true;
      grp.works.push(w);
    }

    const defaultGroupRank = new Map<string, number>();
    if (singleColMode) {
      const onlyColId = Array.from(distinctCols)[0];
      const onlyCol = onlyColId !== '__none__' ? colMap.get(onlyColId) : undefined;
      (onlyCol?.categories || []).forEach((cat, idx) => {
        defaultGroupRank.set(`${onlyColId}::${cat}`, idx);
      });
      defaultGroupRank.set(`${onlyColId}::__uncat__`, 99999);
    } else {
      collections.forEach((c, idx) => defaultGroupRank.set(c.id, idx));
      defaultGroupRank.set('__none__', 99999);
    }

    const customRank = new Map<string, number>();
    customGroupOrderKeys.forEach((k, idx) => customRank.set(k, idx));

    const groups = Array.from(bucketMap.values()).sort((a, b) => {
      const ca = customRank.get(a.key);
      const cb = customRank.get(b.key);
      if (ca !== undefined && cb !== undefined) return ca - cb;
      if (ca !== undefined) return -1;
      if (cb !== undefined) return 1;
      const da = defaultGroupRank.get(a.key) ?? 50000;
      const db = defaultGroupRank.get(b.key) ?? 50000;
      return da - db;
    });

    return groups.map((g) => {
      const customIds = customGroupWorkOrderMap[g.key];
      const baseOrderedWorks =
        customIds && customIds.length > 0
          ? (() => {
              const wRank = new Map<string, number>();
              customIds.forEach((id, idx) => wRank.set(id, idx));
              return [...g.works].sort((a, b) => {
                const ra = wRank.get(a.id);
                const rb = wRank.get(b.id);
                if (ra !== undefined && rb !== undefined) return ra - rb;
                if (ra !== undefined) return -1;
                if (rb !== undefined) return 1;
                return 0;
              });
            })()
          : g.works;

      // Nested subcategory grouping inside multi-collection exports
      if (!singleColMode && groupSubcategoriesInCollection && g.hasSubcategories) {
        const subMap = new Map<string, DerivedPdfSubGroup>();
        for (const w of baseOrderedWorks) {
          const cat = w.category || '';
          const sk = `${g.key}::${cat || '__uncat__'}`;
          let sg = subMap.get(sk);
          if (!sg) {
            sg = {
              key: sk,
              title: cat || '未指定子分類',
              isNamedCategory: Boolean(cat),
              works: [],
            };
            subMap.set(sk, sg);
          }
          sg.works.push(w);
        }

        const defaultSubRank = new Map<string, number>();
        g.subcategoriesOrder.forEach((c, idx) => defaultSubRank.set(`${g.key}::${c}`, idx));
        defaultSubRank.set(`${g.key}::__uncat__`, 99999);

        const customSubRank = new Map<string, number>();
        (customSubGroupOrderMap[g.key] || []).forEach((sk, idx) => customSubRank.set(sk, idx));

        const sortedSubGroups = Array.from(subMap.values())
          .sort((a, b) => {
            const ca = customSubRank.get(a.key);
            const cb = customSubRank.get(b.key);
            if (ca !== undefined && cb !== undefined) return ca - cb;
            if (ca !== undefined) return -1;
            if (cb !== undefined) return 1;
            return (
              (defaultSubRank.get(a.key) ?? 50000) -
              (defaultSubRank.get(b.key) ?? 50000)
            );
          })
          .map((sg) => {
            const subIds = customSubGroupWorkOrderMap[sg.key];
            if (!subIds || subIds.length === 0) return sg;
            const swRank = new Map<string, number>();
            subIds.forEach((id, idx) => swRank.set(id, idx));
            const sortedSubWorks = [...sg.works].sort((a, b) => {
              const ra = swRank.get(a.id);
              const rb = swRank.get(b.id);
              if (ra !== undefined && rb !== undefined) return ra - rb;
              if (ra !== undefined) return -1;
              if (rb !== undefined) return 1;
              return 0;
            });
            return { ...sg, works: sortedSubWorks };
          });

        const hasMeaningfulSub =
          sortedSubGroups.length > 1 ||
          (sortedSubGroups.length === 1 && sortedSubGroups[0].isNamedCategory);

        if (hasMeaningfulSub) {
          return {
            ...g,
            subGroups: sortedSubGroups,
            works: sortedSubGroups.flatMap((sg) => sg.works),
          };
        }
      }

      return { ...g, works: baseOrderedWorks };
    });
  }, [
    baseWorksToExport,
    collections,
    customGroupOrderKeys,
    customGroupWorkOrderMap,
    groupSubcategoriesInCollection,
    customSubGroupOrderMap,
    customSubGroupWorkOrderMap,
  ]);

  const worksToExport = useMemo(() => {
    if (!groupByCollection) return flatOrderedWorks;
    return groupedSections.flatMap((g) => g.works);
  }, [groupByCollection, flatOrderedWorks, groupedSections]);

  type SortPreset = 'date-desc' | 'date-asc' | 'title-asc' | 'category';

  const sortWorkList = (
    list: WorkItem[],
    preset: SortPreset,
    subcatsOrder: string[] = []
  ): WorkItem[] => {
    const copy = [...list];
    if (preset === 'date-desc') {
      return copy.sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt - a.updatedAt
      );
    }
    if (preset === 'date-asc') {
      return copy.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.updatedAt - b.updatedAt
      );
    }
    if (preset === 'title-asc') {
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
    }
    const catRank = new Map<string, number>();
    subcatsOrder.forEach((c, idx) => catRank.set(c, idx));
    return copy.sort((a, b) => {
      const ca = a.category || '';
      const cb = b.category || '';
      const ra = ca ? catRank.get(ca) ?? 9999 : 99999;
      const rb = cb ? catRank.get(cb) ?? 9999 : 99999;
      if (ra !== rb) return ra - rb;
      if (ca !== cb) return ca.localeCompare(cb, 'zh-Hant');
      return b.createdAt.localeCompare(a.createdAt);
    });
  };

  const applyFlatPreset = (preset: SortPreset | 'default') => {
    if (preset === 'default') {
      setCustomFlatOrderIds(unlockedWorks.map((w) => w.id));
      return;
    }
    const sortedIds = sortWorkList(flatOrderedWorks, preset).map((w) => w.id);
    const sortedSet = new Set(sortedIds);
    setCustomFlatOrderIds((prev) => [
      ...sortedIds,
      ...prev.filter((id) => !sortedSet.has(id)),
    ]);
  };

  const moveFlatWork = (workId: string, direction: 'up' | 'down' | 'top') => {
    const ids = flatOrderedWorks.map((w) => w.id);
    const idx = ids.indexOf(workId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === ids.length - 1) return;
    if (direction === 'top' && idx === 0) return;

    const next = [...ids];
    const [moved] = next.splice(idx, 1);
    const targetIdx = direction === 'top' ? 0 : direction === 'up' ? idx - 1 : idx + 1;
    next.splice(targetIdx, 0, moved);

    const nextSet = new Set(next);
    setCustomFlatOrderIds((prev) => [...next, ...prev.filter((id) => !nextSet.has(id))]);
  };

  const moveGroup = (groupKey: string, direction: 'up' | 'down') => {
    const keys = groupedSections.map((g) => g.key);
    const idx = keys.indexOf(groupKey);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === keys.length - 1) return;
    const next = [...keys];
    const [moved] = next.splice(idx, 1);
    next.splice(direction === 'up' ? idx - 1 : idx + 1, 0, moved);
    setCustomGroupOrderKeys(next);
  };

  const moveGroupWork = (
    groupKey: string,
    workId: string,
    direction: 'up' | 'down' | 'top'
  ) => {
    const grp = groupedSections.find((g) => g.key === groupKey);
    if (!grp) return;
    const ids = grp.works.map((w) => w.id);
    const idx = ids.indexOf(workId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === ids.length - 1) return;
    if (direction === 'top' && idx === 0) return;

    const next = [...ids];
    const [moved] = next.splice(idx, 1);
    const targetIdx = direction === 'top' ? 0 : direction === 'up' ? idx - 1 : idx + 1;
    next.splice(targetIdx, 0, moved);

    setCustomGroupWorkOrderMap((prev) => ({
      ...prev,
      [groupKey]: next,
    }));
  };

  const applyGroupPreset = (groupKey: string, preset: SortPreset) => {
    const grp = groupedSections.find((g) => g.key === groupKey);
    if (!grp) return;
    if (grp.subGroups && grp.subGroups.length > 0) {
      const subPatch: Record<string, string[]> = {};
      for (const sg of grp.subGroups) {
        subPatch[sg.key] = sortWorkList(sg.works, preset).map((w) => w.id);
      }
      setCustomSubGroupWorkOrderMap((prev) => ({ ...prev, ...subPatch }));
      return;
    }
    const sortedIds = sortWorkList(grp.works, preset, grp.subcategoriesOrder).map((w) => w.id);
    setCustomGroupWorkOrderMap((prev) => ({
      ...prev,
      [groupKey]: sortedIds,
    }));
  };

  const moveSubGroup = (groupKey: string, subKey: string, direction: 'up' | 'down') => {
    const grp = groupedSections.find((g) => g.key === groupKey);
    if (!grp || !grp.subGroups) return;
    const keys = grp.subGroups.map((sg) => sg.key);
    const idx = keys.indexOf(subKey);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === keys.length - 1) return;
    const next = [...keys];
    const [moved] = next.splice(idx, 1);
    next.splice(direction === 'up' ? idx - 1 : idx + 1, 0, moved);
    setCustomSubGroupOrderMap((prev) => ({
      ...prev,
      [groupKey]: next,
    }));
  };

  const moveSubGroupWork = (
    groupKey: string,
    subKey: string,
    workId: string,
    direction: 'up' | 'down' | 'top'
  ) => {
    const grp = groupedSections.find((g) => g.key === groupKey);
    const sg = grp?.subGroups?.find((s) => s.key === subKey);
    if (!sg) return;
    const ids = sg.works.map((w) => w.id);
    const idx = ids.indexOf(workId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === ids.length - 1) return;
    if (direction === 'top' && idx === 0) return;

    const next = [...ids];
    const [moved] = next.splice(idx, 1);
    const targetIdx = direction === 'top' ? 0 : direction === 'up' ? idx - 1 : idx + 1;
    next.splice(targetIdx, 0, moved);

    setCustomSubGroupWorkOrderMap((prev) => ({
      ...prev,
      [subKey]: next,
    }));
  };

  const applySubGroupPreset = (groupKey: string, subKey: string, preset: SortPreset) => {
    const grp = groupedSections.find((g) => g.key === groupKey);
    const sg = grp?.subGroups?.find((s) => s.key === subKey);
    if (!sg) return;
    const sortedIds = sortWorkList(sg.works, preset).map((w) => w.id);
    setCustomSubGroupWorkOrderMap((prev) => ({
      ...prev,
      [subKey]: sortedIds,
    }));
  };

  const applyAllGroupsPreset = (preset: SortPreset | 'default') => {
    if (preset === 'default') {
      setCustomGroupOrderKeys([]);
      setCustomGroupWorkOrderMap({});
      setCustomSubGroupOrderMap({});
      setCustomSubGroupWorkOrderMap({});
      return;
    }
    const nextMap: Record<string, string[]> = {};
    const nextSubMap: Record<string, string[]> = {};
    for (const g of groupedSections) {
      nextMap[g.key] = sortWorkList(g.works, preset, g.subcategoriesOrder).map((w) => w.id);
      if (g.subGroups) {
        for (const sg of g.subGroups) {
          nextSubMap[sg.key] = sortWorkList(sg.works, preset).map((w) => w.id);
        }
      }
    }
    setCustomGroupWorkOrderMap(nextMap);
    if (Object.keys(nextSubMap).length > 0) {
      setCustomSubGroupWorkOrderMap((prev) => ({ ...prev, ...nextSubMap }));
    }
  };

  const isSingleWorkExport = worksToExport.length === 1;
  const isQueueFullForSelection =
    queuedTasks.length >= MAX_EXPORT_QUEUE_SIZE &&
    !(isSingleWorkExport && queuedTasks.some((t) => t.priority !== 'high'));

  const toggleWorkId = (id: string) => {
    setSelectedWorkIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGeneratePdf = () => {
    if (worksToExport.length === 0) {
      setFeedback({ type: 'error', text: '請至少選取一件作品再進行匯出。' });
      return;
    }

    const resolvedTitle = bookTitle.trim() || '拾光卷宗典藏集';
    const snapshotWorks = [...worksToExport];
    const snapshotCollections = [...collections];
    const snapshotGroups: PdfSectionGroupInput[] | undefined = groupByCollection
      ? groupedSections.map((g) => ({
          key: g.key,
          title: g.title,
          subtitle: g.subtitle,
          workIds: g.works.map((w) => w.id),
          subGroups: g.subGroups?.map<PdfSubGroupInput>((sg) => ({
            key: sg.key,
            title: sg.title,
            isNamedCategory: sg.isNamedCategory,
            workIds: sg.works.map((w) => w.id),
          })),
        }))
      : undefined;

    const snapshotOptions = {
      bookTitle: resolvedTitle,
      bookSubtitle: bookSubtitle.trim() || undefined,
      authorName,
      sealText,
      pageSize,
      paperTone,
      fontStyle,
      includeCover,
      includeSectionDividers,
      includeToc,
      includeSubtitle,
      includeGenre,
      includeCollection,
      includeDate,
      includeTags,
      includeExif,
      groupByCollection,
      groupSubcategoriesInCollection,
      sectionGroups: snapshotGroups,
    };

    const snapshotIsSingle = snapshotWorks.length === 1;

    setLastSubmittedAt(Date.now());
    const result = enqueueTask({
      kind: 'pdf',
      priority: snapshotIsSingle ? 'high' : 'normal',
      title: snapshotIsSingle
        ? `單篇 PDF · ${snapshotWorks[0].title || resolvedTitle}`
        : `PDF 電子讀本 · ${resolvedTitle}`,
      run: async ({ onProgress, yieldAndRespectPriority }) => {
        const res = await exportWorksAsPdfEbook(snapshotWorks, snapshotCollections, {
          ...snapshotOptions,
          onProgress,
          yieldHook: yieldAndRespectPriority,
        });
        const mbOrKb =
          res.byteSize >= 1024 * 1024
            ? `${(res.byteSize / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.max(1, Math.round(res.byteSize / 1024))} KB`;
        return `已成功匯出 ${res.pageCount} 頁 PDF 電子讀本（${mbOrKb}），儲存位置：${res.locationLabel}`;
      },
    });

    if (!result.accepted) {
      setFeedback({ type: 'error', text: result.message });
      return;
    }

    setFeedback(null);
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="sm:max-w-2xl"
      panelClassName="max-h-[92vh] bg-[#F7F6F2] dark:bg-[#171716] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
    >
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between shrink-0">
              {showOrderSubPage ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowOrderSubPage(false)}
                    className="min-h-[40px] -ml-1.5 px-2.5 rounded-xl inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>返回設定</span>
                  </button>
                  <h2 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                    作品排序與分組
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowOrderSubPage(false)}
                    className="min-h-[38px] px-3 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium"
                  >
                    完成
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#284152] dark:text-[#E7E5E0]" />
                    <h2 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                      製作離線 PDF 電子讀本
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="關閉 PDF 匯出視窗"
                    className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5">
              {showOrderSubPage ? (
                <div className="space-y-4">
                  {/* Collection / Subcategory Grouping Toggle */}
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-900 dark:text-stone-100">
                          <Layers className="w-3.5 h-3.5 text-[#284152] dark:text-stone-300 shrink-0" />
                          <span>依作品集／子分類靠近排列並加入分類頁</span>
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                          開啟後會將相同作品集（或單一作品集內的子分類）整理在一起，並為各輯加上獨立章節分隔頁；各輯順序與輯內作品順序皆可個別調整。
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={groupByCollection}
                        onClick={() => setGroupByCollection((v) => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                          groupByCollection
                            ? 'bg-[#284152] dark:bg-[#E7E5E0]'
                            : 'bg-stone-300 dark:bg-stone-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white dark:bg-[#171716] transition-transform ${
                            groupByCollection ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {groupByCollection && multiColHasSubcategories && (
                      <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-stone-800 dark:text-stone-200 block">
                            作品集內的子分類也進行分組顯示
                          </span>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                            於各作品集章節中再依子分類排列與分隔，並可單獨調整子分類順序。
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={groupSubcategoriesInCollection}
                          onClick={() => setGroupSubcategoriesInCollection((v) => !v)}
                          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                            groupSubcategoriesInCollection
                              ? 'bg-[#284152] dark:bg-[#E7E5E0]'
                              : 'bg-stone-300 dark:bg-stone-700'
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white dark:bg-[#171716] transition-transform ${
                              groupSubcategoriesInCollection ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick Presets */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                      {groupByCollection ? '套用至全部作品集／子分類：' : '快速排列順序：'}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'date-desc', label: '時間新→舊' },
                          { id: 'date-asc', label: '時間舊→新' },
                          { id: 'title-asc', label: '標題順序' },
                        ] as const
                      ).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            groupByCollection
                              ? applyAllGroupsPreset(preset.id)
                              : applyFlatPreset(preset.id)
                          }
                          className="min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          groupByCollection
                            ? applyAllGroupsPreset('default')
                            : applyFlatPreset('default')
                        }
                        className="min-h-[32px] px-2.5 rounded-lg text-[11px] text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>恢復預設</span>
                      </button>
                    </div>
                  </div>

                  {groupByCollection ? (
                    <div className="space-y-3">
                      {groupedSections.length <= 1 && (
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 px-1">
                          目前所選作品僅包含 1 個分類，需有 2 個以上作品集或子分類時才會於 PDF 中插入章節分隔頁。
                        </p>
                      )}
                      {groupedSections.map((grp, gIdx) => (
                        <div
                          key={grp.key}
                          className="rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 overflow-hidden"
                        >
                          {/* Group Header with independent sort + group move */}
                          <div className="px-3.5 py-2.5 bg-[#EFECE6]/70 dark:bg-[#242422] border-b border-stone-200/70 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-[#284152]/10 dark:bg-stone-700 text-[#284152] dark:text-stone-200">
                                  第 {String(gIdx + 1).padStart(2, '0')} 輯
                                </span>
                                <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                                  {grp.title}
                                </span>
                                <span className="text-[11px] text-stone-400 tabular-nums shrink-0">
                                  {grp.works.length} 件
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={() => applyGroupPreset(grp.key, 'date-desc')}
                                className="px-2 py-1 rounded text-[10px] font-medium text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800"
                              >
                                新→舊
                              </button>
                              <button
                                type="button"
                                onClick={() => applyGroupPreset(grp.key, 'date-asc')}
                                className="px-2 py-1 rounded text-[10px] font-medium text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800"
                              >
                                舊→新
                              </button>
                              <button
                                type="button"
                                onClick={() => applyGroupPreset(grp.key, 'title-asc')}
                                className="px-2 py-1 rounded text-[10px] font-medium text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800"
                              >
                                標題
                              </button>
                              {grp.hasSubcategories && grp.kind === 'collection' && (
                                <button
                                  type="button"
                                  onClick={() => applyGroupPreset(grp.key, 'category')}
                                  className="px-2 py-1 rounded text-[10px] font-medium text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800"
                                >
                                  子分類
                                </button>
                              )}
                              {groupedSections.length > 1 && (
                                <div className="flex items-center gap-0.5 pl-1 ml-1 border-l border-stone-300/70 dark:border-stone-700">
                                  <button
                                    type="button"
                                    disabled={gIdx === 0}
                                    onClick={() => moveGroup(grp.key, 'up')}
                                    aria-label={`上移分組 ${grp.title}`}
                                    className="p-1.5 rounded text-stone-500 hover:bg-white dark:hover:bg-stone-800 disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={gIdx === groupedSections.length - 1}
                                    onClick={() => moveGroup(grp.key, 'down')}
                                    aria-label={`下移分組 ${grp.title}`}
                                    className="p-1.5 rounded text-stone-500 hover:bg-white dark:hover:bg-stone-800 disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Group Works (flat or nested subcategories) */}
                          {grp.subGroups && grp.subGroups.length > 0 ? (
                            <div className="divide-y divide-stone-200/70 dark:divide-stone-800">
                              {grp.subGroups.map((sg, sIdx) => (
                                <div key={sg.key} className="bg-[#FAF9F6] dark:bg-[#1A1A18]">
                                  <div className="px-3.5 py-2 border-b border-stone-100 dark:border-stone-800/70 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="w-1 h-3.5 rounded-full bg-stone-400 dark:bg-stone-500 shrink-0" />
                                      <span className="text-[11px] font-medium text-stone-700 dark:text-stone-300 truncate">
                                        {sg.title}
                                      </span>
                                      <span className="text-[10px] text-stone-400 tabular-nums shrink-0">
                                        {sg.works.length} 件
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => applySubGroupPreset(grp.key, sg.key, 'date-desc')}
                                        className="px-1.5 py-0.5 rounded text-[10px] text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                                      >
                                        新→舊
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => applySubGroupPreset(grp.key, sg.key, 'date-asc')}
                                        className="px-1.5 py-0.5 rounded text-[10px] text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                                      >
                                        舊→新
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => applySubGroupPreset(grp.key, sg.key, 'title-asc')}
                                        className="px-1.5 py-0.5 rounded text-[10px] text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                                      >
                                        標題
                                      </button>
                                      {grp.subGroups!.length > 1 && (
                                        <div className="flex items-center gap-0.5 pl-1 ml-0.5 border-l border-stone-200 dark:border-stone-700">
                                          <button
                                            type="button"
                                            disabled={sIdx === 0}
                                            onClick={() => moveSubGroup(grp.key, sg.key, 'up')}
                                            aria-label={`上移子分類 ${sg.title}`}
                                            className="p-1 rounded text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800 disabled:opacity-30"
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={sIdx === grp.subGroups!.length - 1}
                                            onClick={() => moveSubGroup(grp.key, sg.key, 'down')}
                                            aria-label={`下移子分類 ${sg.title}`}
                                            className="p-1 rounded text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800 disabled:opacity-30"
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="divide-y divide-stone-100 dark:divide-stone-800/60 bg-white dark:bg-[#1E1E1C]">
                                    {sg.works.map((w, wIdx) => (
                                      <div
                                        key={w.id}
                                        className="pl-5 pr-3.5 py-2 flex items-center justify-between gap-2"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-[11px] tabular-nums text-stone-400 w-5 shrink-0">
                                            {String(wIdx + 1).padStart(2, '0')}
                                          </span>
                                          <div className="min-w-0">
                                            <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                                              {w.title}
                                            </p>
                                            <p className="text-[11px] text-stone-400 truncate tabular-nums">
                                              {w.type === 'photography' ? '攝影' : w.writingGenre || '文字'} · {w.createdAt}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={wIdx === 0}
                                            onClick={() => moveSubGroupWork(grp.key, sg.key, w.id, 'top')}
                                            aria-label={`置頂 ${w.title}`}
                                            title="移至此子分類最前"
                                            className="min-h-[30px] min-w-[28px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                                          >
                                            <ArrowUpToLine className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={wIdx === 0}
                                            onClick={() => moveSubGroupWork(grp.key, sg.key, w.id, 'up')}
                                            aria-label={`上移 ${w.title}`}
                                            className="min-h-[30px] min-w-[28px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                                          >
                                            <ArrowUp className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={wIdx === sg.works.length - 1}
                                            onClick={() => moveSubGroupWork(grp.key, sg.key, w.id, 'down')}
                                            aria-label={`下移 ${w.title}`}
                                            className="min-h-[30px] min-w-[28px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                                          >
                                            <ArrowDown className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                              {grp.works.map((w, wIdx) => (
                                <div
                                  key={w.id}
                                  className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-[11px] tabular-nums text-stone-400 w-5 shrink-0">
                                      {String(wIdx + 1).padStart(2, '0')}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                                        {w.title}
                                      </p>
                                      <p className="text-[11px] text-stone-400 truncate tabular-nums">
                                        {w.type === 'photography' ? '攝影' : w.writingGenre || '文字'}
                                        {w.category ? ` · ${w.category}` : ''} · {w.createdAt}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      type="button"
                                      disabled={wIdx === 0}
                                      onClick={() => moveGroupWork(grp.key, w.id, 'top')}
                                      aria-label={`置頂 ${w.title}`}
                                      title="移至本輯最前"
                                      className="min-h-[32px] min-w-[30px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                                    >
                                      <ArrowUpToLine className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={wIdx === 0}
                                      onClick={() => moveGroupWork(grp.key, w.id, 'up')}
                                      aria-label={`上移 ${w.title}`}
                                      className="min-h-[32px] min-w-[30px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={wIdx === grp.works.length - 1}
                                      onClick={() => moveGroupWork(grp.key, w.id, 'down')}
                                      aria-label={`下移 ${w.title}`}
                                      className="min-h-[32px] min-w-[30px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800/80">
                      {flatOrderedWorks.map((w, idx) => {
                        const colName =
                          collections.find((c) => c.id === w.collectionId)?.name || '未歸類';
                        return (
                          <div
                            key={w.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[11px] tabular-nums text-stone-400 w-6 shrink-0">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                                  {w.title}
                                </p>
                                <p className="text-[11px] text-stone-400 truncate tabular-nums">
                                  {colName}
                                  {w.category ? ` / ${w.category}` : ''} · {w.createdAt}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveFlatWork(w.id, 'top')}
                                aria-label={`置頂 ${w.title}`}
                                title="移至最前"
                                className="min-h-[34px] min-w-[32px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                              >
                                <ArrowUpToLine className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveFlatWork(w.id, 'up')}
                                aria-label={`上移 ${w.title}`}
                                className="min-h-[34px] min-w-[32px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === flatOrderedWorks.length - 1}
                                onClick={() => moveFlatWork(w.id, 'down')}
                                aria-label={`下移 ${w.title}`}
                                className="min-h-[34px] min-w-[32px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-25"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
              {/* Source Mode Toggle */}
              <div className="space-y-3">
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                  1. 選擇收錄範圍
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#222220]">
                  <button
                    type="button"
                    onClick={() => setSourceMode('collection')}
                    className={`relative min-h-[40px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                      sourceMode === 'collection'
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {sourceMode === 'collection' && (
                      <SlidingPill
                        layoutId="pdf-source-pill"
                        className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">依作品集匯出</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('custom')}
                    className={`relative min-h-[40px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                      sourceMode === 'custom'
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {sourceMode === 'custom' && (
                      <SlidingPill
                        layoutId="pdf-source-pill"
                        className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">自由勾選作品（{selectedWorkIds.length}）</span>
                  </button>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                {sourceMode === 'collection' ? (
                  <motion.div
                    key="pdf-source-collection"
                    initial={animationOverhaul ? { opacity: 0, y: 8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={animationOverhaul ? { opacity: 0, y: -6 } : { opacity: 0 }}
                    transition={{ duration: animationOverhaul ? 0.2 : 0.08, ease: [0.25, 0.9, 0.35, 1] }}
                    className="space-y-2"
                  >
                    <select
                      value={targetCollectionId}
                      onChange={(e) => handleCollectionSelectChange(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                    >
                      <option value="all">全部可瀏覽作品（{unlockedWorks.length} 件）</option>
                      <option value="__none__">未加入任何作品集的作品</option>
                      {collections.map((c) => {
                        const count = unlockedWorks.filter((w) => w.collectionId === c.id).length;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name}（{count} 件）
                          </option>
                        );
                      })}
                    </select>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                        將收錄 {collectionFilteredWorks.length} 件未鎖定作品至電子讀本中。
                      </p>
                      {worksToExport.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setShowOrderSubPage(true)}
                          className="text-[11px] text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 inline-flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors shrink-0"
                        >
                          <ArrowUpDown className="w-3 h-3" />
                          <span>{groupByCollection ? '排序 · 已分組' : '調整順序'}</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="pdf-source-custom"
                    initial={animationOverhaul ? { opacity: 0, y: 8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={animationOverhaul ? { opacity: 0, y: -6 } : { opacity: 0 }}
                    transition={{ duration: animationOverhaul ? 0.2 : 0.08, ease: [0.25, 0.9, 0.35, 1] }}
                    className="rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 p-3.5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {(
                          [
                            { id: 'all', label: '全部' },
                            { id: 'writing', label: '文字' },
                            { id: 'photography', label: '攝影' },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setPickFilter(f.id)}
                            className={`relative px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                              pickFilter === f.id
                                ? 'text-white dark:text-stone-900'
                                : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
                            }`}
                          >
                            {pickFilter === f.id && (
                              <SlidingPill
                                layoutId="pdf-pickfilter-pill"
                                className="bg-[#284152] dark:bg-[#E7E5E0] shadow-sm rounded-lg"
                              />
                            )}
                            <span className="relative z-10">{f.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedWorkIds((prev) =>
                              Array.from(new Set([...prev, ...pickerWorks.map((w) => w.id)]))
                            )
                          }
                          className="text-[#284152] dark:text-stone-300 hover:underline"
                        >
                          全選目前
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedWorkIds([])}
                          className="text-stone-400 hover:text-stone-700"
                        >
                          清除
                        </button>
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/80">
                      {pickerWorks.map((w) => {
                        const checked = selectedWorkIds.includes(w.id);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => toggleWorkId(w.id)}
                            className="w-full py-2.5 px-1.5 text-left flex items-center justify-between gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/40 rounded-lg"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                  checked
                                    ? 'bg-[#284152] border-[#284152] text-white dark:bg-[#E7E5E0] dark:border-[#E7E5E0] dark:text-stone-900'
                                    : 'border-stone-300 dark:border-stone-600'
                                }`}
                              >
                                {checked && <Check className="w-3 h-3" />}
                              </span>
                              <span className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                                {w.title}
                              </span>
                            </div>
                            <span className="text-[11px] text-stone-400 shrink-0 tabular-nums">
                              {w.type === 'photography' ? '攝影' : w.writingGenre || '文字'} ·{' '}
                              {w.createdAt}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {worksToExport.length > 1 && (
                      <div className="pt-2 flex items-center justify-between border-t border-stone-100 dark:border-stone-800/80">
                        <span className="text-[11px] text-stone-400 tabular-nums">
                          已勾選 {worksToExport.length} 件
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowOrderSubPage(true)}
                          className="text-[11px] text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 inline-flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          <ArrowUpDown className="w-3 h-3" />
                          <span>{groupByCollection ? '排序 · 已分組' : '調整順序'}</span>
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
                </AnimatePresence>
              </div>

              {/* Book Title & Subtitle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    2. 讀本書名
                  </label>
                  <input
                    type="text"
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder="輸入電子書標題"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    封面副題 / 序語（選填）
                  </label>
                  <input
                    type="text"
                    value={bookSubtitle}
                    onChange={(e) => setBookSubtitle(e.target.value)}
                    placeholder="選輯說明或副標題"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Typography & Reader Format */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    版面尺寸
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#222220]">
                    {(
                      [
                        { id: 'a5', label: 'A5 閱讀器' },
                        { id: 'a4', label: 'A4 平板' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setPageSize(s.id)}
                        className={`relative min-h-[36px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                          pageSize === s.id
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500'
                        }`}
                      >
                        {pageSize === s.id && (
                          <SlidingPill
                            layoutId="pdf-size-pill"
                            className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                          />
                        )}
                        <span className="relative z-10">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    紙張底色
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#222220]">
                    {(
                      [
                        { id: 'ivory', label: '米白' },
                        { id: 'white', label: '純白' },
                        { id: 'warm-gray', label: '素灰' },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaperTone(p.id)}
                        className={`relative min-h-[36px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                          paperTone === p.id
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500'
                        }`}
                      >
                        {paperTone === p.id && (
                          <SlidingPill
                            layoutId="pdf-paper-pill"
                            className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                          />
                        )}
                        <span className="relative z-10">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    內文字體
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#222220]">
                    {(
                      [
                        { id: 'editorial', label: '書頁襯線' },
                        { id: 'sans', label: '清晰黑體' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFontStyle(f.id)}
                        className={`relative min-h-[36px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                          fontStyle === f.id
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500'
                        }`}
                      >
                        {fontStyle === f.id && (
                          <SlidingPill
                            layoutId="pdf-font-pill"
                            className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                          />
                        )}
                        <span className="relative z-10">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Unobtrusive Cover / Section Dividers / TOC Structure Toggles */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                      包含章節：
                      {[
                        includeCover ? '封面首頁' : null,
                        includeSectionDividers ? '集間頁' : null,
                        includeToc ? '目錄頁' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '僅保留作品內頁'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStructureConfig((v) => !v)}
                      className="text-[11px] text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 inline-flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors shrink-0"
                    >
                      <span>{showStructureConfig ? '收合' : '讀本頁數設定'}</span>
                      <ChevronDown
                        className={`w-3 h-3 transition-transform ${
                          showStructureConfig ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  <SmoothCollapse
                    open={showStructureConfig}
                    animate={animationOverhaul}
                    durationMs={220}
                  >
                    <div className="p-3 rounded-xl bg-white/75 dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {
                              label: '封面首頁',
                              checked: includeCover,
                              toggle: () => setIncludeCover((v) => !v),
                            },
                            {
                              label: '集間頁',
                              checked: includeSectionDividers,
                              toggle: () => setIncludeSectionDividers((v) => !v),
                            },
                            {
                              label: '目錄頁',
                              checked: includeToc,
                              toggle: () => setIncludeToc((v) => !v),
                            },
                          ] as const
                        ).map((pageOpt) => (
                          <button
                            key={pageOpt.label}
                            type="button"
                            onClick={pageOpt.toggle}
                            className={`min-h-[36px] px-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                              pageOpt.checked
                                ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                                : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#171716] text-stone-400'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                pageOpt.checked
                                  ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                                  : 'border-stone-300 dark:border-stone-600'
                              }`}
                            >
                              {pageOpt.checked && <Check className="w-2.5 h-2.5" />}
                            </span>
                            <span>{pageOpt.label}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-stone-400 leading-relaxed">
                        「集間頁」會於開啟作品集／子分類分組且包含 2 個以上分類時，插入獨立章節分隔頁。
                      </p>
                    </div>
                  </SmoothCollapse>
                </div>

                {/* Per-Work Content Element Toggles */}
                <div className="p-3.5 rounded-xl bg-white/80 dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-stone-700 dark:text-stone-300">
                      作品內頁包含元素
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setIncludeSubtitle(true);
                          setIncludeGenre(true);
                          setIncludeCollection(true);
                          setIncludeDate(true);
                          setIncludeTags(true);
                          setIncludeExif(true);
                        }}
                        className="text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 underline"
                      >
                        全部包含
                      </button>
                      <span className="text-stone-300 dark:text-stone-700">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIncludeSubtitle(false);
                          setIncludeGenre(false);
                          setIncludeCollection(false);
                          setIncludeDate(false);
                          setIncludeTags(false);
                          setIncludeExif(false);
                        }}
                        className="text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 underline"
                      >
                        僅留標題與內文
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(
                      [
                        {
                          label: '副標題',
                          checked: includeSubtitle,
                          toggle: () => setIncludeSubtitle((v) => !v),
                        },
                        {
                          label: '文體／類型',
                          checked: includeGenre,
                          toggle: () => setIncludeGenre((v) => !v),
                        },
                        {
                          label: '作品集與分類',
                          checked: includeCollection,
                          toggle: () => setIncludeCollection((v) => !v),
                        },
                        {
                          label: '創作／拍攝日期',
                          checked: includeDate,
                          toggle: () => setIncludeDate((v) => !v),
                        },
                        {
                          label: '作品標籤 (#)',
                          checked: includeTags,
                          toggle: () => setIncludeTags((v) => !v),
                        },
                        {
                          label: '攝影 EXIF 參數',
                          checked: includeExif,
                          toggle: () => setIncludeExif((v) => !v),
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.toggle}
                        className={`min-h-[36px] px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-2 transition-colors text-left ${
                          item.checked
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                            : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#171716] text-stone-400'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                            item.checked
                              ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                              : 'border-stone-300 dark:border-stone-600'
                          }`}
                        >
                          {item.checked && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress Bar (Active Export inside Modal) */}
              {activeTask && (
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-stone-700 dark:text-stone-200">
                    <span className="font-medium truncate">{activeTask.title}</span>
                    <span className="tabular-nums font-semibold shrink-0">{activeTask.pct}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                    <div
                      className="h-full bg-[#284152] dark:bg-[#E7E5E0] transition-all duration-150"
                      style={{ width: `${activeTask.pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                    <span className="truncate">{activeTask.label}</span>
                    {queuedTasks.length > 0 && (
                      <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
                        <Clock className="w-3 h-3" />
                        <span>隊列等待 {queuedTasks.length}/{MAX_EXPORT_QUEUE_SIZE}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback */}
              {feedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2 ${
                    feedback.type === 'success'
                      ? 'bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-stone-200'
                      : feedback.type === 'info'
                      ? 'bg-[#EFECE6] dark:bg-[#222220] text-stone-700 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700'
                      : 'bg-[#9E3B33]/10 text-[#9E3B33] dark:text-[#E07A70]'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{feedback.text}</span>
                </div>
              )}
                </>
              )}
            </div>

            {/* Footer */}
            {!showOrderSubPage && (
              <div className="px-5 py-4 pb-safe border-t border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0 bg-[#F7F6F2] dark:bg-[#171716]">
                <span className="text-xs text-stone-500 tabular-nums">
                  已選 {worksToExport.length} 件作品
                  {groupByCollection && groupedSections.length > 1
                    ? ` · 分 ${groupedSections.length} 輯`
                    : ''}
                  {isSingleWorkExport && activeTask ? ' · 高優先插隊' : ''}
                  {queuedPdfCount > 0 ? ` · ${queuedPdfCount} 個等待中` : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] px-4 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
                  >
                    關閉
                  </button>
                  <button
                    type="button"
                    disabled={isQueueFullForSelection || worksToExport.length === 0}
                    onClick={handleGeneratePdf}
                    className="min-h-[44px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-45 whitespace-nowrap shrink-0"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>
                      {isQueueFullForSelection ? '隊列已滿 (5/5)' : '匯出 PDF 電子讀本'}
                    </span>
                  </button>
                </div>
              </div>
            )}
    </BottomSheet>
  );
};
