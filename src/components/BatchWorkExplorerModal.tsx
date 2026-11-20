import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Folder,
  FolderInput,
  FolderOpen,
  FolderTree,
  Grid,
  Image as ImageIcon,
  List,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Star,
  Tag,
  Trash2,
  Unlock,
  Wand2,
  X,
} from 'lucide-react';
import { Collection, WorkItem } from '../types';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { BottomSheet } from './BottomSheet';
import { SlidingPill } from './SlidingPill';

interface BatchWorkExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  works: WorkItem[];
  collections: Collection[];
  presetTags: string[];
  customTags: string[];
  hasPin: boolean;
  isVaultUnlocked: boolean;
  onRequestSetupPin: () => void;
  onRequestUnlockVault: () => void;
  onBatchUpdateWorks: (updated: WorkItem[]) => Promise<void>;
  onBatchDeleteWorks: (ids: string[]) => Promise<void>;
  onAddCustomTag: (tag: string) => Promise<void>;
}

type FolderTarget =
  | { kind: 'all' }
  | { kind: 'uncollected' }
  | { kind: 'favorites' }
  | { kind: 'collection'; collectionId: string; category?: string };

type ExplorerViewMode = 'list' | 'grid';
type ExplorerSort = 'newest' | 'oldest' | 'title' | 'type';
type ConditionRuleType = 'has-tag' | 'in-collection' | 'writing-genre' | 'period';
type BatchDialogMode =
  | null
  | 'add-tags'
  | 'remove-tags'
  | 'move-collection'
  | 'change-genre'
  | 'confirm-delete';

const WRITING_GENRE_OPTIONS = [
  '現代詩',
  '散文隨筆',
  '手記',
  '短篇小說',
  '章節小說',
  '閱讀摘錄',
];

export const BatchWorkExplorerModal: React.FC<BatchWorkExplorerModalProps> = ({
  isOpen,
  onClose,
  works,
  collections,
  presetTags,
  customTags,
  hasPin,
  isVaultUnlocked,
  onRequestSetupPin,
  onRequestUnlockVault,
  onBatchUpdateWorks,
  onBatchDeleteWorks,
  onAddCustomTag,
}) => {
  useBodyScrollLock(isOpen);
  const { animationOverhaul } = useMotionPreferences();
  const [activeFolder, setActiveFolder] = useState<FolderTarget>({ kind: 'all' });
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  const [mobileFolderDrawerOpen, setMobileFolderDrawerOpen] = useState(false);

  const [viewMode, setViewMode] = useState<ExplorerViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'photography' | 'writing'>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all'); // 'all' | '__untagged__' | tagName
  const [favFilter, setFavFilter] = useState<'all' | 'favorite' | 'non-favorite'>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<ExplorerSort>('newest');

  // Conditional selection state
  const [selectMode, setSelectMode] = useState<'replace' | 'append'>('replace');
  const [condRuleType, setCondRuleType] = useState<ConditionRuleType>('has-tag');
  const [condRuleValue, setCondRuleValue] = useState<string>('');

  // Selected IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch Action Dialogs
  const [batchDialog, setBatchDialog] = useState<BatchDialogMode>(null);
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [saveNewToCustom, setSaveNewToCustom] = useState(true);
  const [tagsToRemove, setTagsToRemove] = useState<string[]>([]);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  const [targetCategory, setTargetCategory] = useState<string>('');
  const [targetGenre, setTargetGenre] = useState<string>('現代詩');
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setNotice('');
    setBatchDialog(null);
    setMobileFolderDrawerOpen(false);
  }, [isOpen]);

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.id, c])),
    [collections]
  );

  const allExistingTags = useMemo(() => {
    const set = new Set<string>();
    works.forEach((w) => {
      if (!(w.isPrivate && w.isSealed)) {
        w.tags.forEach((t) => set.add(t));
      }
    });
    return Array.from(set);
  }, [works]);

  const { availableYears, availableMonths } = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    works.forEach((w) => {
      if (w.createdAt && /^\d{4}-\d{2}/.test(w.createdAt)) {
        years.add(w.createdAt.slice(0, 4));
        months.add(w.createdAt.slice(0, 7));
      }
    });
    return {
      availableYears: Array.from(years).sort((a, b) => b.localeCompare(a)),
      availableMonths: Array.from(months).sort((a, b) => b.localeCompare(a)),
    };
  }, [works]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>(WRITING_GENRE_OPTIONS);
    works.forEach((w) => {
      if (w.type === 'writing' && w.writingGenre && !(w.isPrivate && w.isSealed)) {
        set.add(w.writingGenre);
      }
    });
    return Array.from(set);
  }, [works]);

  // Keep conditional selection dropdown value valid when rule type switches
  useEffect(() => {
    if (condRuleType === 'has-tag') {
      setCondRuleValue(allExistingTags[0] || '');
    } else if (condRuleType === 'in-collection') {
      setCondRuleValue(collections[0]?.id || '__none__');
    } else if (condRuleType === 'writing-genre') {
      setCondRuleValue(availableGenres[0] || '現代詩');
    } else if (condRuleType === 'period') {
      setCondRuleValue(availableMonths[0] || availableYears[0] || '');
    }
  }, [condRuleType, allExistingTags, collections, availableGenres, availableMonths, availableYears]);

  // Folder-scoped works before fine-grained filters
  const folderWorks = useMemo(() => {
    return works.filter((w) => {
      if (activeFolder.kind === 'uncollected') {
        return !w.collectionId || !collectionMap.has(w.collectionId);
      }
      if (activeFolder.kind === 'favorites') {
        return w.favorite;
      }
      if (activeFolder.kind === 'collection') {
        if (w.collectionId !== activeFolder.collectionId) return false;
        if (activeFolder.category && w.category !== activeFolder.category) return false;
      }
      return true;
    });
  }, [works, activeFolder, collectionMap]);

  // Filtered & sorted works displayed in the explorer pane
  const displayedWorks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = folderWorks.filter((w) => {
      if (typeFilter !== 'all' && w.type !== typeFilter) return false;
      if (genreFilter !== 'all') {
        if (w.type !== 'writing' || w.writingGenre !== genreFilter) return false;
      }
      if (tagFilter === '__untagged__') {
        if (w.tags.length > 0) return false;
      } else if (tagFilter !== 'all') {
        if (!w.tags.includes(tagFilter)) return false;
      }
      if (favFilter === 'favorite' && !w.favorite) return false;
      if (favFilter === 'non-favorite' && w.favorite) return false;
      if (periodFilter !== 'all' && (!w.createdAt || !w.createdAt.startsWith(periodFilter))) {
        return false;
      }
      if (q) {
        if (w.isPrivate && w.isSealed) return false;
        const colName = collectionMap.get(w.collectionId)?.name || '';
        const haystack = [
          w.title,
          w.subtitle || '',
          w.content,
          w.writingGenre || '',
          colName,
          w.category || '',
          w.tags.join(' '),
          w.photoMeta?.camera || '',
          w.photoMeta?.location || '',
          w.createdAt,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, 'zh-Hant');
      }
      if (sortBy === 'oldest') {
        return a.createdAt.localeCompare(b.createdAt) || a.updatedAt - b.updatedAt;
      }
      if (sortBy === 'type') {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.createdAt.localeCompare(a.createdAt) || b.updatedAt - a.updatedAt;
    });

    return list;
  }, [
    folderWorks,
    typeFilter,
    genreFilter,
    tagFilter,
    favFilter,
    periodFilter,
    searchQuery,
    sortBy,
    collectionMap,
  ]);

  const editableDisplayedWorks = useMemo(
    () => displayedWorks.filter((w) => !(w.isPrivate && w.isSealed)),
    [displayedWorks]
  );

  const selectedWorks = useMemo(
    () => works.filter((w) => selectedIds.has(w.id) && !(w.isPrivate && w.isSealed)),
    [works, selectedIds]
  );

  const selectedWritingCount = useMemo(
    () => selectedWorks.filter((w) => w.type === 'writing').length,
    [selectedWorks]
  );

  const tagsPresentInSelection = useMemo(() => {
    const counts = new Map<string, number>();
    selectedWorks.forEach((w) => {
      w.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedWorks]);

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (genreFilter !== 'all' ? 1 : 0) +
    (tagFilter !== 'all' ? 1 : 0) +
    (favFilter !== 'all' ? 1 : 0) +
    (periodFilter !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setTypeFilter('all');
    setGenreFilter('all');
    setTagFilter('all');
    setFavFilter('all');
    setPeriodFilter('all');
    setSearchQuery('');
  };

  const toggleSelectId = (work: WorkItem) => {
    if (work.isPrivate && work.isSealed) {
      setNotice('已上鎖的私密作品需先解鎖才可進行批量編輯。');
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(work.id)) {
        next.delete(work.id);
      } else {
        next.add(work.id);
      }
      return next;
    });
  };

  const selectAllDisplayed = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      editableDisplayedWorks.forEach((w) => next.add(w.id));
      return next;
    });
  };

  const invertDisplayedSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      editableDisplayedWorks.forEach((w) => {
        if (next.has(w.id)) {
          next.delete(w.id);
        } else {
          next.add(w.id);
        }
      });
      return next;
    });
  };

  const applyConditionalSelection = (predicate: (w: WorkItem) => boolean, label: string) => {
    const matches = editableDisplayedWorks.filter(predicate);
    setSelectedIds((prev) => {
      const next = selectMode === 'append' ? new Set(prev) : new Set<string>();
      matches.forEach((w) => next.add(w.id));
      return next;
    });
    setNotice(
      matches.length > 0
        ? `已依「${label}」選取 ${matches.length} 件作品。`
        : `目前檢視範圍內沒有符合「${label}」的作品。`
    );
  };

  const handleApplyCustomRuleSelect = () => {
    if (!condRuleValue) return;
    if (condRuleType === 'has-tag') {
      applyConditionalSelection((w) => w.tags.includes(condRuleValue), `含標籤 #${condRuleValue}`);
    } else if (condRuleType === 'in-collection') {
      if (condRuleValue === '__none__') {
        applyConditionalSelection(
          (w) => !w.collectionId || !collectionMap.has(w.collectionId),
          '未加入作品集'
        );
      } else {
        const name = collectionMap.get(condRuleValue)?.name || '指定作品集';
        applyConditionalSelection((w) => w.collectionId === condRuleValue, `作品集「${name}」`);
      }
    } else if (condRuleType === 'writing-genre') {
      applyConditionalSelection(
        (w) => w.type === 'writing' && w.writingGenre === condRuleValue,
        `文體：${condRuleValue}`
      );
    } else if (condRuleType === 'period') {
      applyConditionalSelection(
        (w) => Boolean(w.createdAt && w.createdAt.startsWith(condRuleValue)),
        `時間：${condRuleValue}`
      );
    }
  };

  // Combined selectable tag pool for batch-add dialog
  const tagPoolForBatchAdd = useMemo(() => {
    return Array.from(new Set([...presetTags, ...customTags, ...allExistingTags]));
  }, [presetTags, customTags, allExistingTags]);

  const openAddTagsDialog = () => {
    setTagsToAdd([]);
    setNewTagInput('');
    setBatchDialog('add-tags');
  };

  const openRemoveTagsDialog = () => {
    setTagsToRemove([]);
    setBatchDialog('remove-tags');
  };

  const openMoveCollectionDialog = () => {
    setTargetCollectionId(
      activeFolder.kind === 'collection' ? activeFolder.collectionId : ''
    );
    setTargetCategory('');
    setBatchDialog('move-collection');
  };

  const handleConfirmAddTags = async () => {
    const manualTags = newTagInput
      .split(/[,，\s]+/)
      .map((t) => t.trim().replace(/^#+/, ''))
      .filter(Boolean);
    const mergedNew = Array.from(new Set([...tagsToAdd, ...manualTags]));
    if (mergedNew.length === 0 || selectedWorks.length === 0) return;

    setProcessing(true);
    try {
      if (saveNewToCustom && manualTags.length > 0) {
        for (const t of manualTags) {
          if (!presetTags.includes(t) && !customTags.includes(t)) {
            await onAddCustomTag(t);
          }
        }
      }
      const now = Date.now();
      const updated = selectedWorks.map((w) => ({
        ...w,
        tags: Array.from(new Set([...w.tags, ...mergedNew])),
        updatedAt: now,
      }));
      await onBatchUpdateWorks(updated);
      setNotice(`已為 ${updated.length} 件作品新增標籤（${mergedNew.map((t) => `#${t}`).join(' ')}）。`);
      setBatchDialog(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmRemoveTags = async () => {
    if (tagsToRemove.length === 0 || selectedWorks.length === 0) return;
    setProcessing(true);
    try {
      const removeSet = new Set(tagsToRemove);
      const now = Date.now();
      const updated = selectedWorks
        .filter((w) => w.tags.some((t) => removeSet.has(t)))
        .map((w) => ({
          ...w,
          tags: w.tags.filter((t) => !removeSet.has(t)),
          updatedAt: now,
        }));
      if (updated.length > 0) {
        await onBatchUpdateWorks(updated);
      }
      setNotice(`已從 ${updated.length} 件作品移除所選標籤。`);
      setBatchDialog(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmMoveCollection = async () => {
    if (selectedWorks.length === 0) return;
    setProcessing(true);
    try {
      const now = Date.now();
      const updated = selectedWorks.map((w) => ({
        ...w,
        collectionId: targetCollectionId,
        category: targetCollectionId && targetCategory ? targetCategory : undefined,
        updatedAt: now,
      }));
      await onBatchUpdateWorks(updated);
      const destLabel = targetCollectionId
        ? `${collectionMap.get(targetCollectionId)?.name || '作品集'}${
            targetCategory ? ` / ${targetCategory}` : ''
          }`
        : '未歸類（不加入作品集）';
      setNotice(`已將 ${updated.length} 件作品移動至「${destLabel}」。`);
      setBatchDialog(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmChangeGenre = async () => {
    const writingTargets = selectedWorks.filter((w) => w.type === 'writing');
    if (writingTargets.length === 0) return;
    setProcessing(true);
    try {
      const now = Date.now();
      const updated = writingTargets.map((w) => ({
        ...w,
        writingGenre: targetGenre,
        updatedAt: now,
      }));
      await onBatchUpdateWorks(updated);
      setNotice(`已將 ${updated.length} 篇文字作品變更文體為「${targetGenre}」。`);
      setBatchDialog(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchFavorite = async (favoriteValue: boolean) => {
    if (selectedWorks.length === 0) return;
    setProcessing(true);
    try {
      const now = Date.now();
      const updated = selectedWorks.map((w) => ({
        ...w,
        favorite: favoriteValue,
        updatedAt: now,
      }));
      await onBatchUpdateWorks(updated);
      setNotice(
        favoriteValue
          ? `已將 ${updated.length} 件作品標記為精選。`
          : `已取消 ${updated.length} 件作品的精選標記。`
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchPrivacy = async (privateValue: boolean) => {
    if (selectedWorks.length === 0) return;
    if (privateValue && !hasPin) {
      onRequestSetupPin();
      setNotice('請先設定 4 位數隱私密碼，設定後即可批量將作品加入私密並加密保存。');
      return;
    }
    if (privateValue && !isVaultUnlocked) {
      onRequestUnlockVault();
      setNotice('請先解鎖隱私金庫，以便安全加密所選作品。');
      return;
    }

    setProcessing(true);
    try {
      const now = Date.now();
      const updated = selectedWorks.map((w) => ({
        ...w,
        isPrivate: privateValue,
        isSealed: false,
        encryptedPayload: undefined,
        updatedAt: now,
      }));
      await onBatchUpdateWorks(updated);
      setNotice(
        privateValue
          ? `已將 ${updated.length} 件作品加入私密區域並加密保護。`
          : `已將 ${updated.length} 件作品移出私密區域。`
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedWorks.length === 0) return;
    setProcessing(true);
    try {
      const ids = selectedWorks.map((w) => w.id);
      await onBatchDeleteWorks(ids);
      setSelectedIds(new Set());
      setNotice(`已永久刪除 ${ids.length} 件作品。`);
      setBatchDialog(null);
    } finally {
      setProcessing(false);
    }
  };

  const uncollectedCount = useMemo(
    () => works.filter((w) => !w.collectionId || !collectionMap.has(w.collectionId)).length,
    [works, collectionMap]
  );
  const favoritesCount = useMemo(() => works.filter((w) => w.favorite).length, [works]);

  const targetColCategories = useMemo(() => {
    if (!targetCollectionId) return [];
    return collectionMap.get(targetCollectionId)?.categories || [];
  }, [targetCollectionId, collectionMap]);

  const folderTreeContent = (
    <div className="space-y-1">
      <div className="px-2 pb-1.5 text-[11px] font-medium text-stone-400">快速檢視</div>
      <button
        type="button"
        onClick={() => {
          setActiveFolder({ kind: 'all' });
          setMobileFolderDrawerOpen(false);
        }}
        className={`w-full min-h-[40px] px-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
          activeFolder.kind === 'all'
            ? 'bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
            : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/70'
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          <FolderTree className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">全部典藏檔案</span>
        </span>
        <span className="text-[11px] tabular-nums opacity-75">{works.length}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setActiveFolder({ kind: 'uncollected' });
          setMobileFolderDrawerOpen(false);
        }}
        className={`w-full min-h-[40px] px-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
          activeFolder.kind === 'uncollected'
            ? 'bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
            : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/70'
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          <Folder className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">未歸類（無作品集）</span>
        </span>
        <span className="text-[11px] tabular-nums opacity-75">{uncollectedCount}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setActiveFolder({ kind: 'favorites' });
          setMobileFolderDrawerOpen(false);
        }}
        className={`w-full min-h-[40px] px-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
          activeFolder.kind === 'favorites'
            ? 'bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
            : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/70'
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          <Star className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">精選星標作品</span>
        </span>
        <span className="text-[11px] tabular-nums opacity-75">{favoritesCount}</span>
      </button>

      <div className="px-2 pt-3 pb-1.5 text-[11px] font-medium text-stone-400">
        作品集資料夾（{collections.length}）
      </div>
      {collections.map((col) => {
        const colWorks = works.filter((w) => w.collectionId === col.id);
        const cats = col.categories || [];
        const isSelectedCol =
          activeFolder.kind === 'collection' &&
          activeFolder.collectionId === col.id &&
          !activeFolder.category;
        const isExpanded = expandedCols[col.id] ?? isSelectedCol;

        return (
          <div key={col.id} className="space-y-0.5">
            <div className="flex items-center gap-0.5">
              {cats.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCols((prev) => ({ ...prev, [col.id]: !isExpanded }))
                  }
                  aria-label={isExpanded ? '收合子分類' : '展開子分類'}
                  className="min-h-[36px] min-w-[26px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-[26px] shrink-0" />
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveFolder({ kind: 'collection', collectionId: col.id });
                  if (cats.length > 0) {
                    setExpandedCols((prev) => ({ ...prev, [col.id]: true }));
                  }
                  setMobileFolderDrawerOpen(false);
                }}
                className={`flex-1 min-h-[38px] px-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors min-w-0 ${
                  isSelectedCol
                    ? 'bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                    : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/70'
                }`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  {isSelectedCol ? (
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{col.name}</span>
                </span>
                <span className="text-[11px] tabular-nums opacity-75 shrink-0">
                  {colWorks.length}
                </span>
              </button>
            </div>

            {isExpanded && cats.length > 0 && (
              <div className="pl-7 space-y-0.5">
                {cats.map((cat) => {
                  const catCount = colWorks.filter((w) => w.category === cat).length;
                  const isCatActive =
                    activeFolder.kind === 'collection' &&
                    activeFolder.collectionId === col.id &&
                    activeFolder.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setActiveFolder({
                          kind: 'collection',
                          collectionId: col.id,
                          category: cat,
                        });
                        setMobileFolderDrawerOpen(false);
                      }}
                      className={`w-full min-h-[34px] px-2.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                        isCatActive
                          ? 'bg-[#284152]/15 dark:bg-stone-700 text-[#284152] dark:text-white font-medium'
                          : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/60'
                      }`}
                    >
                      <span className="truncate">{cat}</span>
                      <span className="text-[11px] tabular-nums opacity-75">{catCount}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={animationOverhaul ? { opacity: 0, y: 24 } : { opacity: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={animationOverhaul ? { opacity: 0, y: 20 } : { opacity: 0 }}
          transition={
            animationOverhaul
              ? { duration: 0.26, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.16 }
          }
          className="fixed inset-0 z-50 bg-[#F7F6F2] dark:bg-[#111110] flex flex-col pt-safe"
        >
          {/* Explorer Top Header */}
          <header className="px-4 sm:px-6 h-14 border-b border-stone-200/80 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#111110] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-2.5 -ml-2 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 inline-flex items-center gap-1 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回</span>
              </button>
              <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-editorial text-sm sm:text-base md:text-lg font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                  <span className="sm:hidden">檔案總管</span>
                  <span className="hidden sm:inline">檔案總管 · 批量整理</span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobileFolderDrawerOpen((o) => !o)}
                className={`md:hidden min-h-[38px] px-2 sm:px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 shrink-0 ${
                  mobileFolderDrawerOpen
                    ? 'border-[#284152] bg-[#284152] text-white'
                    : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#191918] text-stone-700 dark:text-stone-300'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">資料夾</span>
              </button>

              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#EFECE6] dark:bg-[#1E1E1C] border border-stone-200/60 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="詳細列表檢視"
                  className={`relative min-h-[34px] min-w-[34px] rounded-md flex items-center justify-center transition-colors ${
                    viewMode === 'list'
                      ? 'text-stone-900 dark:text-stone-100'
                      : 'text-stone-500'
                  }`}
                >
                  {viewMode === 'list' && (
                    <SlidingPill
                      layoutId="batch-viewmode-pill"
                      className="bg-white dark:bg-[#111110] shadow-sm rounded-md"
                    />
                  )}
                  <List className="w-4 h-4 relative z-10" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="縮圖格狀檢視"
                  className={`relative min-h-[34px] min-w-[34px] rounded-md flex items-center justify-center transition-colors ${
                    viewMode === 'grid'
                      ? 'text-stone-900 dark:text-stone-100'
                      : 'text-stone-500'
                  }`}
                >
                  {viewMode === 'grid' && (
                    <SlidingPill
                      layoutId="batch-viewmode-pill"
                      className="bg-white dark:bg-[#111110] shadow-sm rounded-md"
                    />
                  )}
                  <Grid className="w-4 h-4 relative z-10" />
                </button>
              </div>
            </div>
          </header>

          {/* Mobile Folder Drawer */}
          {mobileFolderDrawerOpen && (
            <div className="md:hidden border-b border-stone-200 dark:border-stone-800 bg-[#F0EDE6] dark:bg-[#171716] px-4 py-3 max-h-[50vh] overflow-y-auto overscroll-contain shrink-0">
              {folderTreeContent}
            </div>
          )}

          {/* Split Body */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Desktop Left Folder Sidebar */}
            <aside className="hidden md:block w-64 shrink-0 border-r border-stone-200/80 dark:border-stone-800 bg-[#F3F1EC] dark:bg-[#151514] p-3.5 overflow-y-auto overscroll-contain">
              {folderTreeContent}
            </aside>

            {/* Right Main Explorer Pane */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Breadcrumb + Search + Filter Toggle */}
              <div className="px-4 sm:px-6 py-3 border-b border-stone-200/70 dark:border-stone-800/80 bg-white/50 dark:bg-[#161615] space-y-2.5 shrink-0">
                {/* Path Breadcrumb */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center flex-wrap gap-1 text-stone-600 dark:text-stone-300">
                    <button
                      type="button"
                      onClick={() => setActiveFolder({ kind: 'all' })}
                      className="hover:underline font-medium"
                    >
                      本機典藏
                    </button>
                    {activeFolder.kind === 'uncollected' && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                          未歸類資料夾
                        </span>
                      </>
                    )}
                    {activeFolder.kind === 'favorites' && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                          精選星標作品
                        </span>
                      </>
                    )}
                    {activeFolder.kind === 'collection' && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                        <button
                          type="button"
                          onClick={() =>
                            setActiveFolder({
                              kind: 'collection',
                              collectionId: activeFolder.collectionId,
                            })
                          }
                          className={`hover:underline ${
                            !activeFolder.category
                              ? 'font-semibold text-stone-900 dark:text-stone-100'
                              : ''
                          }`}
                        >
                          {collectionMap.get(activeFolder.collectionId)?.name || '作品集'}
                        </button>
                        {activeFolder.category && (
                          <>
                            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                            <span className="font-semibold text-stone-900 dark:text-stone-100">
                              {activeFolder.category}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <span className="text-[11px] tabular-nums text-stone-400">
                    顯示 {displayedWorks.length} 件 · 已選 {selectedIds.size} 件
                  </span>
                </div>

                {/* Search & Filter/Conditional Selection Drawer Button */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜尋檔名、內文、標籤、相機、日期..."
                      className="w-full min-h-[40px] pl-9 pr-8 rounded-xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="清除搜尋"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFilterPanel((s) => !s)}
                    className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                      showFilterPanel || activeFilterCount > 0
                        ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-stone-100'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1E1E1C] text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>
                      篩選與條件選取{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </span>
                  </button>
                </div>

                {/* Collapsible Filter & Conditional Selection Panel */}
                {showFilterPanel && (
                  <div className="p-3.5 rounded-2xl bg-[#F7F6F2] dark:bg-[#1C1C1A] border border-stone-200/80 dark:border-stone-800 space-y-4">
                    {/* Part 1: Filters */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-stone-700 dark:text-stone-300">
                          條件篩選
                        </span>
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>重設篩選</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        <select
                          value={typeFilter}
                          onChange={(e) =>
                            setTypeFilter(e.target.value as 'all' | 'photography' | 'writing')
                          }
                          aria-label="類型篩選"
                          className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200"
                        >
                          <option value="all">全部類型</option>
                          <option value="photography">僅攝影圖檔</option>
                          <option value="writing">僅文字文稿</option>
                        </select>

                        <select
                          value={genreFilter}
                          onChange={(e) => setGenreFilter(e.target.value)}
                          aria-label="文體篩選"
                          className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200"
                        >
                          <option value="all">全部文體</option>
                          {availableGenres.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>

                        <select
                          value={tagFilter}
                          onChange={(e) => setTagFilter(e.target.value)}
                          aria-label="標籤篩選"
                          className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200"
                        >
                          <option value="all">全部標籤</option>
                          <option value="__untagged__">尚未設定標籤</option>
                          {allExistingTags.map((t) => (
                            <option key={t} value={t}>
                              #{t}
                            </option>
                          ))}
                        </select>

                        <select
                          value={favFilter}
                          onChange={(e) =>
                            setFavFilter(e.target.value as 'all' | 'favorite' | 'non-favorite')
                          }
                          aria-label="精選篩選"
                          className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200"
                        >
                          <option value="all">全部精選狀態</option>
                          <option value="favorite">僅精選作品</option>
                          <option value="non-favorite">非精選作品</option>
                        </select>

                        <select
                          value={periodFilter}
                          onChange={(e) => setPeriodFilter(e.target.value)}
                          aria-label="時間篩選"
                          className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200 tabular-nums"
                        >
                          <option value="all">全部時間</option>
                          {availableYears.map((y) => (
                            <option key={y} value={y}>
                              {y} 全年
                            </option>
                          ))}
                          {availableMonths.map((ym) => (
                            <option key={ym} value={ym}>
                              {ym.replace('-', '.')} 月
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Part 2: Conditional Batch Selection */}
                    <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 inline-flex items-center gap-1">
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>條件選取（一鍵批量勾選目前視圖項目）</span>
                        </span>

                        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFECE6] dark:bg-[#252523]">
                          <button
                            type="button"
                            onClick={() => setSelectMode('replace')}
                            className={`relative px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                              selectMode === 'replace'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500'
                            }`}
                          >
                            {selectMode === 'replace' && (
                              <SlidingPill
                                layoutId="batch-selectmode-pill"
                                className="bg-white dark:bg-[#141413] shadow-sm rounded-md"
                              />
                            )}
                            <span className="relative z-10">取代選取</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectMode('append')}
                            className={`relative px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                              selectMode === 'append'
                                ? 'text-stone-900 dark:text-stone-100'
                                : 'text-stone-500'
                            }`}
                          >
                            {selectMode === 'append' && (
                              <SlidingPill
                                layoutId="batch-selectmode-pill"
                                className="bg-white dark:bg-[#141413] shadow-sm rounded-md"
                              />
                            )}
                            <span className="relative z-10">累加選取</span>
                          </button>
                        </div>
                      </div>

                      {/* Quick Condition Buttons */}
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            applyConditionalSelection((w) => w.tags.length === 0, '尚未設定標籤')
                          }
                          className="min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-[11px] text-stone-700 dark:text-stone-300 hover:border-[#284152]"
                        >
                          選取未設標籤
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyConditionalSelection(
                              (w) => !w.collectionId || !collectionMap.has(w.collectionId),
                              '未歸類作品集'
                            )
                          }
                          className="min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-[11px] text-stone-700 dark:text-stone-300 hover:border-[#284152]"
                        >
                          選取未歸類作品
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyConditionalSelection(
                              (w) => w.type === 'photography',
                              '全部攝影圖檔'
                            )
                          }
                          className="min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-[11px] text-stone-700 dark:text-stone-300 hover:border-[#284152]"
                        >
                          選取攝影圖檔
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyConditionalSelection((w) => w.type === 'writing', '全部文字文稿')
                          }
                          className="min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-[11px] text-stone-700 dark:text-stone-300 hover:border-[#284152]"
                        >
                          選取文字文稿
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyConditionalSelection((w) => !w.favorite, '尚未標記精選')
                          }
                          className="min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-[11px] text-stone-700 dark:text-stone-300 hover:border-[#284152]"
                        >
                          選取非精選
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyConditionalSelection((w) => !w.isPrivate, '非私密作品')
                          }
                          className="min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-[11px] text-stone-700 dark:text-stone-300 hover:border-[#284152]"
                        >
                          選取非私密作品
                        </button>
                      </div>

                      {/* Custom Rule Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={condRuleType}
                          onChange={(e) => setCondRuleType(e.target.value as ConditionRuleType)}
                          aria-label="條件選取種類"
                          className="min-h-[36px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200"
                        >
                          <option value="has-tag">包含指定標籤</option>
                          <option value="in-collection">屬於指定作品集</option>
                          <option value="writing-genre">屬於指定文體</option>
                          <option value="period">建立於指定時間</option>
                        </select>

                        <select
                          value={condRuleValue}
                          onChange={(e) => setCondRuleValue(e.target.value)}
                          aria-label="條件選取目標值"
                          className="flex-1 min-w-[140px] min-h-[36px] px-2.5 rounded-lg bg-white dark:bg-[#242422] border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200"
                        >
                          {condRuleType === 'has-tag' &&
                            (allExistingTags.length > 0 ? (
                              allExistingTags.map((t) => (
                                <option key={t} value={t}>
                                  #{t}
                                </option>
                              ))
                            ) : (
                              <option value="">尚無標籤</option>
                            ))}

                          {condRuleType === 'in-collection' && (
                            <>
                              {collections.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                              <option value="__none__">未加入作品集</option>
                            </>
                          )}

                          {condRuleType === 'writing-genre' &&
                            availableGenres.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}

                          {condRuleType === 'period' && (
                            <>
                              {availableYears.map((y) => (
                                <option key={y} value={y}>
                                  {y} 全年
                                </option>
                              ))}
                              {availableMonths.map((ym) => (
                                <option key={ym} value={ym}>
                                  {ym.replace('-', '.')} 月
                                </option>
                              ))}
                            </>
                          )}
                        </select>

                        <button
                          type="button"
                          onClick={handleApplyCustomRuleSelect}
                          disabled={!condRuleValue}
                          className="min-h-[36px] px-3 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium disabled:opacity-40"
                        >
                          套用選取
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Selection Strip & Sort */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllDisplayed}
                      className="min-h-[32px] px-2.5 rounded-lg bg-stone-100 dark:bg-[#222220] text-stone-700 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-800 inline-flex items-center gap-1 font-medium"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>全選</span>
                    </button>
                    <button
                      type="button"
                      onClick={invertDisplayedSelection}
                      className="min-h-[32px] px-2.5 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      反選
                    </button>
                    {selectedIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="min-h-[32px] px-2.5 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
                      >
                        取消全選
                      </button>
                    )}
                  </div>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as ExplorerSort)}
                    aria-label="檔案排序方式"
                    className="min-h-[32px] px-2.5 rounded-lg bg-transparent border border-stone-200/80 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400"
                  >
                    <option value="newest">依時間（新到舊）</option>
                    <option value="oldest">依時間（舊到新）</option>
                    <option value="title">依名稱排列</option>
                    <option value="type">依檔案類型分組</option>
                  </select>
                </div>

                {notice && (
                  <div className="px-3 py-2 rounded-xl bg-[#284152]/10 dark:bg-stone-800 text-xs text-[#284152] dark:text-stone-200 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{notice}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotice('')}
                      className="text-stone-400 hover:text-stone-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Scrollable Explorer Files List / Grid */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-28">
                {displayedWorks.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <p className="font-editorial text-lg text-stone-500">
                      此資料夾或篩選條件下沒有符合的作品
                    </p>
                    {activeFilterCount > 0 || searchQuery ? (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-xs text-[#284152] dark:text-stone-300 underline"
                      >
                        清除篩選條件
                      </button>
                    ) : null}
                  </div>
                ) : viewMode === 'list' ? (
                  <div className="border border-stone-200/80 dark:border-stone-800 rounded-2xl bg-white dark:bg-[#191918] overflow-hidden">
                    {/* Desktop Table Header */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-4 py-2.5 border-b border-stone-200/70 dark:border-stone-800 bg-[#F7F6F2]/70 dark:bg-[#1E1E1C] text-[11px] font-medium text-stone-500">
                      <div className="col-span-5">名稱與內容類型</div>
                      <div className="col-span-3">作品集與子分類</div>
                      <div className="col-span-2">標籤</div>
                      <div className="col-span-2 text-right">創作日期</div>
                    </div>

                    <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                      {displayedWorks.map((work) => {
                        const isSealed = Boolean(work.isPrivate && work.isSealed);
                        const isSelected = selectedIds.has(work.id);
                        const colName =
                          collectionMap.get(work.collectionId)?.name || '未歸類';

                        return (
                          <div
                            key={work.id}
                            onClick={() => toggleSelectId(work)}
                            className={`px-3 sm:px-4 py-3 flex sm:grid sm:grid-cols-12 items-center gap-3 cursor-pointer transition-colors ${
                              isSealed
                                ? 'opacity-60 bg-stone-50/60 dark:bg-[#161615]'
                                : isSelected
                                ? 'bg-[#284152]/[0.06] dark:bg-stone-800/60'
                                : 'hover:bg-stone-50 dark:hover:bg-[#20201E]'
                            }`}
                          >
                            {/* File Name + Checkbox + Thumbnail */}
                            <div className="flex-1 min-w-0 sm:col-span-5 flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectId(work);
                                }}
                                aria-label={`選取 ${work.title}`}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-stone-500 shrink-0"
                              >
                                {isSealed ? (
                                  <Lock className="w-4 h-4 text-[#9E3B33]" />
                                ) : isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0]" />
                                ) : (
                                  <Square className="w-4 h-4 text-stone-400" />
                                )}
                              </button>

                              {work.type === 'photography' && work.imageData && !isSealed ? (
                                <img
                                  src={work.imageData}
                                  alt={work.title}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 rounded-lg object-cover bg-stone-100 dark:bg-stone-800 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-[#EFECE6] dark:bg-[#242422] flex items-center justify-center text-stone-500 shrink-0">
                                  {work.type === 'photography' ? (
                                    <ImageIcon className="w-4 h-4" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                                    {isSealed ? '私密加密作品（未解鎖）' : work.title}
                                  </span>
                                  {work.favorite && (
                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                                  )}
                                  {work.isPrivate && !isSealed && (
                                    <Lock className="w-3 h-3 text-[#9E3B33] dark:text-[#E07A70] shrink-0" />
                                  )}
                                </div>
                                <div className="text-[11px] text-stone-400 truncate mt-0.5">
                                  <span>
                                    {work.type === 'photography'
                                      ? '攝影圖檔'
                                      : work.writingGenre || '文字文稿'}
                                  </span>
                                  <span className="sm:hidden">
                                    {' · '}
                                    {colName}
                                    {work.category ? ` / ${work.category}` : ''}
                                    {' · '}
                                    {work.createdAt}
                                  </span>
                                </div>
                                {work.tags.length > 0 && (
                                  <div className="sm:hidden text-[11px] text-stone-500 truncate mt-0.5">
                                    {work.tags.map((t) => `#${t}`).join(' · ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Folder / Category */}
                            <div className="hidden sm:block sm:col-span-3 text-xs text-stone-600 dark:text-stone-400 truncate">
                              {colName}
                              {work.category ? ` / ${work.category}` : ''}
                            </div>

                            {/* Tags */}
                            <div className="hidden sm:block sm:col-span-2 text-xs text-stone-500 dark:text-stone-400 truncate">
                              {work.tags.length > 0
                                ? work.tags.map((t) => `#${t}`).join(' · ')
                                : '未設標籤'}
                            </div>

                            {/* Date */}
                            <div className="hidden sm:block sm:col-span-2 text-right text-xs tabular-nums text-stone-400">
                              {work.createdAt}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Grid Thumbnail Explorer View */
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {displayedWorks.map((work) => {
                      const isSealed = Boolean(work.isPrivate && work.isSealed);
                      const isSelected = selectedIds.has(work.id);
                      const colName =
                        collectionMap.get(work.collectionId)?.name || '未歸類';

                      return (
                        <div
                          key={work.id}
                          onClick={() => toggleSelectId(work)}
                          className={`relative rounded-2xl border p-2.5 cursor-pointer transition-all flex flex-col gap-2 ${
                            isSealed
                              ? 'opacity-60 border-stone-200 dark:border-stone-800 bg-white dark:bg-[#191918]'
                              : isSelected
                              ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/[0.05] dark:bg-stone-800/60 ring-1 ring-[#284152]/30'
                              : 'border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#191918] hover:border-stone-300'
                          }`}
                        >
                          <div className="relative h-28 rounded-xl overflow-hidden bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center">
                            {work.type === 'photography' && work.imageData && !isSealed ? (
                              <img
                                src={work.imageData}
                                alt={work.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="px-3 text-center space-y-1">
                                <FileText className="w-6 h-6 text-stone-400 mx-auto" />
                                <p className="text-[10px] text-stone-400 line-clamp-2">
                                  {isSealed
                                    ? '私密加密封存中'
                                    : work.content?.slice(0, 48) || work.writingGenre}
                                </p>
                              </div>
                            )}

                            <div className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-white/90 dark:bg-[#141413]/90 flex items-center justify-center shadow-sm">
                              {isSealed ? (
                                <Lock className="w-3.5 h-3.5 text-[#9E3B33]" />
                              ) : isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0]" />
                              ) : (
                                <Square className="w-4 h-4 text-stone-400" />
                              )}
                            </div>

                            {work.favorite && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 dark:bg-[#141413]/90 flex items-center justify-center">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 px-0.5">
                            <div className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
                              {isSealed ? '私密加密作品' : work.title}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate mt-0.5 tabular-nums">
                              {colName} · {work.createdAt}
                            </div>
                            {work.tags.length > 0 && (
                              <div className="text-[10px] text-stone-500 truncate mt-0.5">
                                {work.tags.map((t) => `#${t}`).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Bottom Batch Action Bar */}
          <AnimatePresence>
            {selectedWorks.length > 0 && (
              <motion.div
                initial={{ y: 64, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 64, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171716] px-4 sm:px-6 py-3 pb-safe shadow-lg shrink-0"
              >
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center justify-between sm:justify-start gap-3">
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
                      已選取 {selectedWorks.length} 件作品
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                    >
                      取消選取
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    <button
                      type="button"
                      disabled={processing}
                      onClick={openAddTagsDialog}
                      className="min-h-[38px] px-3 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>新增標籤</span>
                    </button>

                    <button
                      type="button"
                      disabled={processing || tagsPresentInSelection.length === 0}
                      onClick={openRemoveTagsDialog}
                      className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#20201E] text-stone-700 dark:text-stone-200 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>移除標籤</span>
                    </button>

                    <button
                      type="button"
                      disabled={processing}
                      onClick={openMoveCollectionDialog}
                      className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#20201E] text-stone-700 dark:text-stone-200 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                      <span>移動作品集</span>
                    </button>

                    {selectedWritingCount > 0 && (
                      <button
                        type="button"
                        disabled={processing}
                        onClick={() => setBatchDialog('change-genre')}
                        className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#20201E] text-stone-700 dark:text-stone-200 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>變更文體</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => void handleBatchFavorite(true)}
                      className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#20201E] text-stone-700 dark:text-stone-200 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Star className="w-3.5 h-3.5" />
                      <span>設為精選</span>
                    </button>

                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => void handleBatchFavorite(false)}
                      className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#20201E] text-stone-600 dark:text-stone-300 text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      取消精選
                    </button>

                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => void handleBatchPrivacy(true)}
                      className="min-h-[38px] px-3 rounded-xl border border-[#284152]/30 dark:border-stone-600 bg-white dark:bg-[#20201E] text-[#284152] dark:text-stone-200 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>加入私密</span>
                    </button>

                    {selectedWorks.some((w) => w.isPrivate) && (
                      <button
                        type="button"
                        disabled={processing}
                        onClick={() => void handleBatchPrivacy(false)}
                        className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#20201E] text-stone-600 dark:text-stone-300 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>移出私密</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => setBatchDialog('confirm-delete')}
                      className="min-h-[38px] px-3 rounded-xl border border-[#9E3B33]/30 text-[#9E3B33] dark:text-[#E07A70] text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>刪除</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Batch Action Sub-Modal */}
          <BottomSheet
            isOpen={Boolean(batchDialog)}
            onClose={() => {
              if (!processing) setBatchDialog(null);
            }}
            closeOnBackdrop={!processing}
            swipeToDismiss={!processing}
            zIndexClass="z-[60]"
            maxWidthClass="sm:max-w-md"
            handleInsidePaddedPanel
            panelClassName="bg-[#F7F6F2] dark:bg-[#171716] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-4 shadow-2xl"
          >
                  {batchDialog === 'add-tags' && (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                          批量新增標籤（{selectedWorks.length} 件）
                        </h3>
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-stone-400"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-3 max-h-[55vh] overflow-y-auto overscroll-contain">
                        <div>
                          <label className="block text-xs text-stone-500 mb-1.5">
                            點選現有標籤（可複選）
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {tagPoolForBatchAdd.map((tag) => {
                              const active = tagsToAdd.includes(tag);
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() =>
                                    setTagsToAdd((prev) =>
                                      prev.includes(tag)
                                        ? prev.filter((t) => t !== tag)
                                        : [...prev, tag]
                                    )
                                  }
                                  className={`min-h-[32px] px-2.5 rounded-lg text-xs border transition-colors ${
                                    active
                                      ? 'border-[#284152] bg-[#284152] dark:border-[#E7E5E0] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-[#222220] text-stone-700 dark:text-stone-300'
                                  }`}
                                >
                                  #{tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-stone-500 mb-1.5">
                            或輸入新標籤（多標籤可用空白或逗號隔開）
                          </label>
                          <input
                            type="text"
                            value={newTagInput}
                            onChange={(e) => setNewTagInput(e.target.value)}
                            placeholder="例如：秋夜 底片練習"
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                          />
                          <label className="flex items-center gap-2 mt-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={saveNewToCustom}
                              onChange={(e) => setSaveNewToCustom(e.target.checked)}
                              className="w-4 h-4 accent-[#284152]"
                            />
                            <span>將新輸入的標籤同時儲存至常用自訂標籤</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[40px] px-4 text-xs text-stone-500"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={
                            processing ||
                            (tagsToAdd.length === 0 && newTagInput.trim() === '')
                          }
                          onClick={() => void handleConfirmAddTags()}
                          className="min-h-[40px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>套用標籤</span>
                        </button>
                      </div>
                    </>
                  )}

                  {batchDialog === 'remove-tags' && (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                          批量移除標籤
                        </h3>
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-stone-400"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <p className="text-xs text-stone-500">
                        點選要從已選作品中移除的標籤：
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-[45vh] overflow-y-auto overscroll-contain">
                        {tagsPresentInSelection.map(([tag, count]) => {
                          const active = tagsToRemove.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                setTagsToRemove((prev) =>
                                  prev.includes(tag)
                                    ? prev.filter((t) => t !== tag)
                                    : [...prev, tag]
                                )
                              }
                              className={`min-h-[34px] px-3 rounded-lg text-xs border transition-colors tabular-nums ${
                                active
                                  ? 'border-[#9E3B33] bg-[#9E3B33] text-white'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-[#222220] text-stone-700 dark:text-stone-300'
                              }`}
                            >
                              #{tag} · {count}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[40px] px-4 text-xs text-stone-500"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={processing || tagsToRemove.length === 0}
                          onClick={() => void handleConfirmRemoveTags()}
                          className="min-h-[40px] px-5 rounded-xl bg-[#9E3B33] text-white text-xs font-medium disabled:opacity-40"
                        >
                          確認移除
                        </button>
                      </div>
                    </>
                  )}

                  {batchDialog === 'move-collection' && (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                          移動至作品集（{selectedWorks.length} 件）
                        </h3>
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-stone-400"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-stone-500 mb-1.5">
                            目標作品集
                          </label>
                          <select
                            value={targetCollectionId}
                            onChange={(e) => {
                              setTargetCollectionId(e.target.value);
                              setTargetCategory('');
                            }}
                            className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                          >
                            <option value="">不加入任何作品集（未歸類）</option>
                            {collections.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {targetCollectionId && targetColCategories.length > 0 && (
                          <div>
                            <label className="block text-xs text-stone-500 mb-1.5">
                              目標子分類（選填）
                            </label>
                            <select
                              value={targetCategory}
                              onChange={(e) => setTargetCategory(e.target.value)}
                              className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                            >
                              <option value="">不指定子分類</option>
                              {targetColCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[40px] px-4 text-xs text-stone-500"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => void handleConfirmMoveCollection()}
                          className="min-h-[40px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>確認移動</span>
                        </button>
                      </div>
                    </>
                  )}

                  {batchDialog === 'change-genre' && (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                          批量變更文字文體（{selectedWritingCount} 篇）
                        </h3>
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-stone-400"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <p className="text-xs text-stone-500">
                        僅套用於已選項目中的文字作品，攝影圖檔將保持不變。
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {WRITING_GENRE_OPTIONS.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setTargetGenre(g)}
                            className={`min-h-[36px] px-3 rounded-lg text-xs border transition-colors ${
                              targetGenre === g
                                ? 'border-[#284152] bg-[#284152] dark:border-[#E7E5E0] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                                : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-[#222220] text-stone-700 dark:text-stone-300'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[40px] px-4 text-xs text-stone-500"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => void handleConfirmChangeGenre()}
                          className="min-h-[40px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium"
                        >
                          套用文體
                        </button>
                      </div>
                    </>
                  )}

                  {batchDialog === 'confirm-delete' && (
                    <>
                      <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                        確認批量刪除？
                      </h3>
                      <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                        您即將從本機裝置永久刪除{' '}
                        <span className="font-semibold text-[#9E3B33] tabular-nums">
                          {selectedWorks.length}
                        </span>{' '}
                        件作品，此動作無法復原。建議先匯出備份檔後再刪除。
                      </p>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setBatchDialog(null)}
                          className="min-h-[40px] px-4 text-xs text-stone-500"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => void handleConfirmBatchDelete()}
                          className="min-h-[40px] px-5 rounded-xl bg-[#9E3B33] text-white text-xs font-medium"
                        >
                          確認永久刪除
                        </button>
                      </div>
                    </>
                  )}
          </BottomSheet>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
