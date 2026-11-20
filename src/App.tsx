import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  BarChart3,
  CheckCircle2,
  Clock,
  FolderKanban,
  Images,
  LayoutGrid,
  Loader2,
  Lock,
  MapPin,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Unlock,
  X,
} from 'lucide-react';
import { SmoothCollapse } from './components/SmoothCollapse';
import {
  ExportQueueProvider,
  MAX_EXPORT_QUEUE_SIZE,
  useExportQueue,
} from './contexts/ExportQueueContext';
import { MotionPreferencesProvider } from './contexts/MotionConfigContext';
import { AnalyticsModal } from './components/AnalyticsModal';
import { ArchiveFilterModal, SortOrder } from './components/ArchiveFilterModal';
import { ArchiveLayouts } from './components/ArchiveLayouts';
import { ArchiveStatsOverview } from './components/ArchiveStatsOverview';
import { BatchWorkExplorerModal } from './components/BatchWorkExplorerModal';
import { CollectionsManager } from './components/CollectionsManager';
import { PdfEbookModal } from './components/PdfEbookModal';
import { PinLockModal } from './components/PinLockModal';
import { RandomSpotlightCard } from './components/RandomSpotlightCard';
import { ShareCardStudio } from './components/ShareCardStudio';
import { SlidingNavIndicator, SlidingPill } from './components/SlidingPill';
import { VaultAndBackupView } from './components/VaultAndBackupView';
import { WelcomeModal } from './components/WelcomeModal';
import {
  clearAllWorkDrafts,
  removeWorkDraft,
  WorkEditorModal,
} from './components/WorkEditorModal';
import {
  clearAllReadingProgress,
  removeReadingProgressEntries,
  WorkReaderModal,
} from './components/WorkReaderModal';
import { SEED_COLLECTIONS, SEED_WORKS } from './data/seedWorks';
import {
  deriveAesKey,
  generateSalt,
  hashPin,
  sealWorkItem,
  unsealWorkItem,
} from './services/crypto';
import { exportCache } from './services/exportCache';
import { isAnyModalLocked, useBodyScrollLock } from './hooks/useBodyScrollLock';
import {
  checkIsSeeded,
  clearCollections,
  clearWorks,
  DEFAULT_PRESET_TAGS,
  DEFAULT_SETTINGS,
  deleteCollection as dbDeleteCollection,
  deleteWork as dbDeleteWork,
  deleteWorksBatch as dbDeleteWorksBatch,
  getAllCollections,
  getAllWorks,
  loadSettings,
  markSeeded,
  saveCollection,
  saveCollectionsBatch,
  saveSettings,
  saveWork,
  saveWorksBatch,
} from './services/storage';
import {
  ActiveTab,
  AddButtonPosition,
  AppSettings,
  BackupArchive,
  Collection,
  SavedShareTemplate,
  WorkItem,
} from './types';
import {
  initGlobalErrorRecovery,
  recordCrashIncident,
  hasPendingCrashPrompt,
  dismissPendingCrashPrompt,
  isSafeModeActive,
  setSafeModeActive,
} from './services/recoveryService';
import { auditAndRepairResourceIntegrity } from './services/resourceIntegrity';
import { scheduleIdleStorageOptimization } from './services/storageOptimizer';

// Initialize global crash error listener immediately
initGlobalErrorRecovery();

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  GlobalErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    recordCrashIncident(error, 'react_boundary', errorInfo.componentStack || undefined);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F6F2] dark:bg-[#111110] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-[#191918] rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
              拾光卷宗 · 異常安全防護
            </h2>
            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed text-left">
              應用偵測到渲染過程出現非預期異常。請放心，您儲存於本地 IndexedDB 的文字與照片資料完整無虞。
            </p>
            {this.state.error && (
              <div className="p-3 rounded-xl bg-stone-100 dark:bg-[#222220] text-[11px] font-mono text-stone-700 dark:text-stone-300 text-left overflow-x-auto max-h-28">
                {this.state.error.message}
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSafeModeActive(true);
                  window.location.reload();
                }}
                className="w-full min-h-[44px] rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium hover:opacity-95"
              >
                進入安全模式並重整（推薦）
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                }}
                className="w-full min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                直接重試載入
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string; label?: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; resetKey?: string; label?: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '頁面載入時發生非預期錯誤',
    };
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-lg mx-auto my-12 p-6 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-800 text-center space-y-3">
          <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
            {this.props.label || '此頁面'}暫時無法顯示
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            已安全攔截異常狀態，您的作品資料完全不受影響。
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-4 py-2 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium"
          >
            重新載入區塊
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type FilterScope = 'all' | 'photography' | 'writing' | 'favorite' | 'private';

const SEED_WORK_IDS = new Set(SEED_WORKS.map((w) => w.id));
const SEED_COLLECTION_IDS = new Set(SEED_COLLECTIONS.map((c) => c.id));

const BASE_WRITING_GENRES = [
  '現代詩',
  '散文隨筆',
  '手記',
  '短篇小說',
  '章節小說',
  '閱讀摘錄',
];

const TAB_ORDER: ActiveTab[] = ['archive', 'collections', 'studio', 'vault'];

const TAB_TRANSITION_VARIANTS = {
  enter: (ctx: { dir: 1 | -1; overhaul: boolean }) =>
    ctx.overhaul
      ? { opacity: 0, x: ctx.dir * 18 }
      : { opacity: 1, x: 0 },
  center: (ctx: { dir: 1 | -1; overhaul: boolean }) =>
    ctx.overhaul
      ? {
          opacity: 1,
          x: 0,
          transition: {
            x: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
            opacity: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
          },
        }
      : {
          opacity: 1,
          x: 0,
          transition: { duration: 0 },
        },
  exit: (ctx: { dir: 1 | -1; overhaul: boolean }) =>
    ctx.overhaul
      ? {
          opacity: 0,
          x: ctx.dir * -12,
          transition: {
            x: { duration: 0.12, ease: [0.4, 0, 0.7, 0.2] as const },
            opacity: { duration: 0.11, ease: [0.4, 0, 1, 1] as const },
          },
        }
      : { opacity: 1, x: 0, transition: { duration: 0 } },
};

function isInteractiveOrScrollableTarget(
  target: EventTarget | null,
  boundary: HTMLElement
): boolean {
  let el: HTMLElement | null = target instanceof HTMLElement ? target : null;
  while (el && el !== boundary) {
    if (
      el.matches(
        'input, textarea, select, option, button, a, label, [role="slider"], [role="switch"], [contenteditable="true"], [data-no-swipe="true"]'
      )
    ) {
      return true;
    }
    if (el.scrollWidth > el.clientWidth + 4) {
      const ox = window.getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

function AppShell() {
  const {
    activeTask,
    queuedTasks,
    lastNotice,
    isCardExportingPriority,
    cancelQueuedTask,
    dismissNotice,
  } = useExportQueue();
  const [exportPopoverOpen, setExportPopoverOpen] = useState(false);
  const [confirmCancelTaskId, setConfirmCancelTaskId] = useState<string | null>(null);

  const [isSafeMode, setIsSafeMode] = useState<boolean>(() => isSafeModeActive());
  const [showCrashPrompt, setShowCrashPrompt] = useState<boolean>(false);

  const [ready, setReady] = useState(false);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [activeTab, setActiveTabState] = useState<ActiveTab>('archive');
  const activeTabRef = useRef<ActiveTab>('archive');
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);
  const setActiveTab = useCallback((nextTab: ActiveTab) => {
    const prev = activeTabRef.current;
    if (prev !== nextTab) {
      const prevIdx = TAB_ORDER.indexOf(prev);
      const nextIdx = TAB_ORDER.indexOf(nextTab);
      if (prevIdx >= 0 && nextIdx >= 0) {
        setTabDirection(nextIdx >= prevIdx ? 1 : -1);
      }
      activeTabRef.current = nextTab;
      setActiveTabState(nextTab);
    }
  }, []);
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [filterScope, setFilterScope] = useState<FilterScope>('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all'); // 'all' | 'YYYY' | 'YYYY-MM'
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [lastGalleryLayout, setLastGalleryLayout] = useState<
    'masonry' | 'grid' | 'index' | 'magazine'
  >('masonry');

  useEffect(() => {
    if (settings.layout !== 'map') {
      setLastGalleryLayout(settings.layout);
    }
  }, [settings.layout]);

  // Reader, Editor, Share Studio, PDF Modals
  const [readingWorkId, setReadingWorkId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<WorkItem | null>(null);
  const [editorDefaultCollection, setEditorDefaultCollection] = useState<string | undefined>(
    undefined
  );
  const [shareModalWork, setShareModalWork] = useState<WorkItem | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfInitialCollectionId, setPdfInitialCollectionId] = useState<string | undefined>(
    undefined
  );
  const [batchExplorerOpen, setBatchExplorerOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Crypto / PIN Lock State
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
  const [pinModalState, setPinModalState] = useState<{
    open: boolean;
    mode: 'unlock' | 'setup' | 'verify-disable';
    pendingWorkId?: string;
    pendingAction?: 'change-pin';
  }>({ open: false, mode: 'unlock' });

  const isMinimalMode = Boolean(settings.minimalMode);
  const effectiveOverhaul = Boolean(settings.animationOverhaul) && !isSafeMode;
  const customBrandTitle = settings.brandTitle?.trim() || '拾光卷宗';
  const displayBrandTitle = isMinimalMode ? '拾光卷宗' : customBrandTitle;

  // Sync dark mode class on <html> & document title
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    document.title = isMinimalMode
      ? '拾光卷宗（極簡模式） — 離線文字與攝影作品集'
      : `${displayBrandTitle} — 離線文字與攝影作品集`;
  }, [settings.theme, displayBrandTitle, isMinimalMode]);

  // Initial offline database hydration
  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const [loadedSettings, seeded] = await Promise.all([
          loadSettings(),
          checkIsSeeded(),
        ]);

        if (!seeded) {
          await saveCollectionsBatch(SEED_COLLECTIONS);
          await saveWorksBatch(SEED_WORKS);
          await markSeeded();
        }

        const [loadedWorks, loadedCollections] = await Promise.all([
          getAllWorks(),
          getAllCollections(),
        ]);

        if (!mounted) return;
        if (!loadedSettings.hasSeenWelcome) {
          const markedSettings = { ...loadedSettings, hasSeenWelcome: true };
          setSettings(markedSettings);
          void saveSettings(markedSettings);
          setWelcomeOpen(true);
        } else {
          setSettings(loadedSettings);
        }

        // Enforce sealed display state on launch when PIN protection is active
        const normalizedWorks = loadedSettings.hasPin
          ? loadedWorks.map((w) =>
              w.isPrivate && !w.isSealed && w.encryptedPayload
                ? {
                    ...w,
                    title: '私密典藏作品',
                    subtitle: undefined,
                    content: '',
                    imageData: undefined,
                    photoMeta: undefined,
                    chapters: undefined,
                    isSealed: true,
                  }
                : w
            )
          : loadedWorks;

        const finalCollections = loadedCollections.length > 0 ? loadedCollections : SEED_COLLECTIONS;
        setWorks(normalizedWorks);
        setCollections(finalCollections);

        // Check for pending crash auto-recovery prompt
        if (hasPendingCrashPrompt() && !isSafeModeActive()) {
          setShowCrashPrompt(true);
        }

        // Silent resource integrity monitor & repair on launch
        void auditAndRepairResourceIntegrity(normalizedWorks, finalCollections).then(
          ({ result, repairedWorks }) => {
            if (mounted && result.repairedCount > 0) {
              setWorks(repairedWorks);
            }
          }
        );

        if (
          loadedSettings.hasPin &&
          loadedSettings.requireLockOnLaunch &&
          normalizedWorks.some((w) => w.isPrivate)
        ) {
          setPinModalState({ open: true, mode: 'unlock' });
        }
      } catch (err) {
        recordCrashIncident(err, 'uncaught_error', 'App.bootstrap');
        if (mounted) {
          setCollections((prev) => (prev.length > 0 ? prev : SEED_COLLECTIONS));
        }
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  // Idle storage and cache cleanup service
  useEffect(() => {
    if (!ready) return;
    const cancelCleanup = scheduleIdleStorageOptimization(3500);
    return () => {
      cancelCleanup();
    };
  }, [ready]);

  // Non-blocking lightweight export cache pre-warming (paused in Safe Mode)
  useEffect(() => {
    if (!ready || works.length === 0 || isSafeMode) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void exportCache.prewarmWorks(works, collections, () =>
        new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      );
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, works, collections, isSafeMode]);

  const isConciseCopy = Boolean(settings.conciseCopyMode);
  useBodyScrollLock(showCrashPrompt);

  useEffect(() => {
    if (!isMinimalMode) return;
    if (activeTab === 'collections' || activeTab === 'studio') {
      setActiveTab('archive');
    }
    if (filterScope === 'favorite') {
      setFilterScope('all');
    }
    setFilterModalOpen(false);
    setPdfModalOpen(false);
    setBatchExplorerOpen(false);
    setAnalyticsOpen(false);
    setShareModalWork(null);
  }, [isMinimalMode, activeTab, filterScope, setActiveTab]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const isVaultUnlocked = !settings.hasPin || aesKey !== null;

  const lockVault = useCallback(async () => {
    const keyToUse = aesKey;
    const updatedWorks = await Promise.all(
      works.map(async (w) => {
        if (w.isPrivate && !w.isSealed) {
          return sealWorkItem(w, keyToUse);
        }
        return w;
      })
    );
    await saveWorksBatch(updatedWorks);
    setWorks(updatedWorks);
    setAesKey(null);
    setReadingWorkId(null);
  }, [aesKey, works]);

  const handlePinSubmit = async (pin: string): Promise<boolean> => {
    if (pinModalState.mode === 'setup') {
      const salt = generateSalt();
      const digest = await hashPin(pin, salt);
      const derived = await deriveAesKey(pin, salt);
      setAesKey(derived);
      await updateSettings({
        hasPin: true,
        pinHash: digest,
        pinSalt: salt,
      });

      // Re-encrypt all unsealed private works in IndexedDB with the new AES key
      // while keeping them unlocked in active React state
      const stateWorks: WorkItem[] = [];
      const dbWorksToSave: WorkItem[] = [];
      for (const w of works) {
        if (w.isPrivate && !w.isSealed && derived) {
          const sealed = await sealWorkItem(w, derived);
          dbWorksToSave.push(sealed);
          stateWorks.push({ ...w, encryptedPayload: sealed.encryptedPayload });
        } else {
          stateWorks.push(w);
        }
      }
      if (dbWorksToSave.length > 0) {
        await saveWorksBatch(dbWorksToSave);
      }
      setWorks(stateWorks);
      setPinModalState({ open: false, mode: 'unlock' });
      return true;
    }

    if (!settings.pinSalt || !settings.pinHash) return false;
    const candidate = await hashPin(pin, settings.pinSalt);
    if (candidate !== settings.pinHash) {
      return false;
    }

    const derived = await deriveAesKey(pin, settings.pinSalt);

    if (pinModalState.mode === 'verify-disable') {
      // Decrypt all sealed works before removing PIN
      const unsealed = await Promise.all(works.map((w) => unsealWorkItem(w, derived)));
      await saveWorksBatch(unsealed);
      setWorks(unsealed);
      setAesKey(null);
      await updateSettings({
        hasPin: false,
        pinHash: undefined,
        pinSalt: undefined,
        requireLockOnLaunch: false,
      });
      setPinModalState({ open: false, mode: 'unlock' });
      return true;
    }

    // Unlock mode
    setAesKey(derived);
    const unsealed = await Promise.all(works.map((w) => unsealWorkItem(w, derived)));
    setWorks(unsealed);
    const pendingId = pinModalState.pendingWorkId;
    const nextAction = pinModalState.pendingAction;

    if (nextAction === 'change-pin') {
      setPinModalState({ open: true, mode: 'setup' });
      return true;
    }

    setPinModalState({ open: false, mode: 'unlock' });
    if (pendingId) {
      setReadingWorkId(pendingId);
    }
    return true;
  };

  // All unique tags across unlocked works
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    works.forEach((w) => {
      if (!(w.isPrivate && w.isSealed)) {
        w.tags.forEach((t) => tagSet.add(t));
      }
    });
    return Array.from(tagSet);
  }, [works]);

  // All writing genres (base presets + any custom/legacy genres in stored works)
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>(BASE_WRITING_GENRES);
    works.forEach((w) => {
      if (w.type === 'writing' && w.writingGenre && !(w.isPrivate && w.isSealed)) {
        genreSet.add(w.writingGenre);
      }
    });
    return Array.from(genreSet);
  }, [works]);

  // Available years & year-months sorted chronologically for timeline filtering
  const { availableYears, availableMonths } = useMemo(() => {
    const yearSet = new Set<string>();
    const monthSet = new Set<string>();
    works.forEach((w) => {
      if (w.createdAt && /^\d{4}-\d{2}/.test(w.createdAt)) {
        yearSet.add(w.createdAt.slice(0, 4));
        monthSet.add(w.createdAt.slice(0, 7));
      }
    });
    return {
      availableYears: Array.from(yearSet).sort((a, b) => b.localeCompare(a)),
      availableMonths: Array.from(monthSet).sort((a, b) => a.localeCompare(b)), // earliest -> latest
    };
  }, [works]);

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.id, c.name])),
    [collections]
  );

  // Sub-categories available for the currently selected collection
  const availableCategoriesForSelectedCollection = useMemo(() => {
    if (selectedCollectionId === 'all' || selectedCollectionId === '__none__') return [];
    const col = collections.find((c) => c.id === selectedCollectionId);
    const catSet = new Set<string>(col?.categories || []);
    works.forEach((w) => {
      if (w.collectionId === selectedCollectionId && w.category && !(w.isPrivate && w.isSealed)) {
        catSet.add(w.category);
      }
    });
    return Array.from(catSet);
  }, [collections, works, selectedCollectionId]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filtered & sorted works
  const filteredWorks = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const list = works.filter((w) => {
      if (filterScope === 'photography' && w.type !== 'photography') return false;
      if (filterScope === 'writing' && w.type !== 'writing') return false;
      if (filterScope === 'favorite' && !w.favorite) return false;
      if (filterScope === 'private' && !w.isPrivate) return false;

      if (selectedCollectionId === '__none__') {
        if (w.collectionId && collectionMap.has(w.collectionId)) {
          return false;
        }
      } else if (selectedCollectionId !== 'all' && w.collectionId !== selectedCollectionId) {
        return false;
      }

      if (
        selectedCollectionId !== 'all' &&
        selectedCollectionId !== '__none__' &&
        selectedCategory !== 'all' &&
        w.category !== selectedCategory
      ) {
        return false;
      }

      if (selectedGenre !== 'all') {
        if (w.type !== 'writing' || w.writingGenre !== selectedGenre) {
          return false;
        }
      }

      if (selectedTag !== 'all' && !w.tags.includes(selectedTag)) {
        return false;
      }

      if (selectedPeriod !== 'all') {
        if (!w.createdAt || !w.createdAt.startsWith(selectedPeriod)) {
          return false;
        }
      }

      if (q) {
        if (w.isPrivate && w.isSealed) return false;
        const colName = collectionMap.get(w.collectionId) || '';
        const chapterText = (w.chapters || [])
          .map((ch) => `${ch.title} ${ch.content}`)
          .join(' ');
        const haystack = [
          w.title,
          w.subtitle || '',
          w.content,
          chapterText,
          w.writingGenre || '',
          colName,
          w.category || '',
          w.tags.join(' '),
          w.photoMeta?.camera || '',
          w.photoMeta?.film || '',
          w.photoMeta?.location || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortOrder === 'title') {
        return a.title.localeCompare(b.title, 'zh-Hant');
      }
      if (sortOrder === 'oldest') {
        return a.createdAt.localeCompare(b.createdAt) || a.updatedAt - b.updatedAt;
      }
      return b.createdAt.localeCompare(a.createdAt) || b.updatedAt - a.updatedAt;
    });

    return list;
  }, [
    works,
    filterScope,
    selectedCollectionId,
    selectedCategory,
    selectedGenre,
    selectedTag,
    deferredSearchQuery,
    sortOrder,
    collectionMap,
    selectedPeriod,
  ]);

  const readingWork = useMemo(
    () => works.find((w) => w.id === readingWorkId) || null,
    [works, readingWorkId]
  );

  const handleSelectWork = useCallback((work: WorkItem) => {
    if (work.isPrivate && work.isSealed) {
      setPinModalState({
        open: true,
        mode: 'unlock',
        pendingWorkId: work.id,
      });
      return;
    }
    setReadingWorkId(work.id);
  }, []);

  const handleSaveWork = async (work: WorkItem) => {
    const workToPersist =
      work.isPrivate && aesKey ? await sealWorkItem(work, aesKey) : work;
    await saveWork(workToPersist);
    exportCache.invalidateWork(work.id);
    setWorks((prev) => {
      const exists = prev.some((item) => item.id === work.id);
      if (exists) {
        return prev.map((item) => (item.id === work.id ? work : item));
      }
      return [work, ...prev];
    });
  };

  const handleDeleteWork = async (work: WorkItem) => {
    await dbDeleteWork(work.id);
    exportCache.invalidateWork(work.id);
    removeWorkDraft(work.id);
    removeReadingProgressEntries([work.id]);
    setWorks((prev) => prev.filter((item) => item.id !== work.id));
    setReadingWorkId(null);
  };

  const handleToggleFavorite = useCallback(async (work: WorkItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = { ...work, favorite: !work.favorite, updatedAt: Date.now() };
    const toPersist =
      updated.isPrivate && aesKey ? await sealWorkItem(updated, aesKey) : updated;
    await saveWork(toPersist);
    setWorks((prev) => prev.map((w) => (w.id === work.id ? updated : w)));
  }, [aesKey]);

  const handleTogglePrivate = async (work: WorkItem) => {
    if (!work.isPrivate && !settings.hasPin) {
      setPinModalState({ open: true, mode: 'setup' });
      return;
    }
    const updated = {
      ...work,
      isPrivate: !work.isPrivate,
      isSealed: false,
      encryptedPayload: undefined,
      updatedAt: Date.now(),
    };
    const toPersist =
      updated.isPrivate && aesKey ? await sealWorkItem(updated, aesKey) : updated;
    await saveWork(toPersist);
    setWorks((prev) => prev.map((w) => (w.id === work.id ? updated : w)));
  };

  const handleToggleMarkdown = async (work: WorkItem) => {
    const defaultEnabled = settings.defaultMarkdownEnabled ?? true;
    const currentEffective =
      work.useMarkdown !== undefined ? Boolean(work.useMarkdown) : defaultEnabled;
    const updated: WorkItem = {
      ...work,
      useMarkdown: !currentEffective,
      updatedAt: Date.now(),
    };
    const toPersist =
      updated.isPrivate && aesKey ? await sealWorkItem(updated, aesKey) : updated;
    await saveWork(toPersist);
    setWorks((prev) => prev.map((w) => (w.id === work.id ? updated : w)));
  };

  const handleCreateCollection = async (name: string, description: string) => {
    const nextOrder =
      collections.reduce((max, c, idx) => Math.max(max, c.sortOrder ?? idx), -1) + 1;
    const col: Collection = {
      id: `col_${Date.now()}`,
      name,
      description,
      sortOrder: nextOrder,
      createdAt: Date.now(),
    };
    await saveCollection(col);
    setCollections((prev) => [...prev, col]);
  };

  const handleUpdateCollection = async (col: Collection) => {
    await saveCollection(col);
    setCollections((prev) => prev.map((c) => (c.id === col.id ? col : c)));
  };

  const handleReorderCollections = async (ordered: Collection[]) => {
    const withOrder = ordered.map((c, idx) => ({ ...c, sortOrder: idx }));
    setCollections(withOrder);
    await saveCollectionsBatch(withOrder);
  };

  const handleBatchUpdateWorks = async (updatedList: WorkItem[]) => {
    if (updatedList.length === 0) return;
    const toPersist = await Promise.all(
      updatedList.map(async (w) =>
        w.isPrivate && !w.isSealed && aesKey ? sealWorkItem(w, aesKey) : w
      )
    );
    await saveWorksBatch(toPersist);
    updatedList.forEach((w) => exportCache.invalidateWork(w.id));
    const updatedMap = new Map(updatedList.map((w) => [w.id, w]));
    setWorks((prev) => prev.map((w) => updatedMap.get(w.id) || w));
  };

  const handleBatchDeleteWorks = async (ids: string[]) => {
    if (ids.length === 0) return;
    await dbDeleteWorksBatch(ids);
    ids.forEach((id) => {
      exportCache.invalidateWork(id);
      removeWorkDraft(id);
    });
    removeReadingProgressEntries(ids);
    const idSet = new Set(ids);
    setWorks((prev) => prev.filter((w) => !idSet.has(w.id)));
    if (readingWorkId && idSet.has(readingWorkId)) {
      setReadingWorkId(null);
    }
  };

  const handleClearSeedWorks = async () => {
    const seedIdsToDelete = works.filter((w) => SEED_WORK_IDS.has(w.id)).map((w) => w.id);
    if (seedIdsToDelete.length > 0) {
      await dbDeleteWorksBatch(seedIdsToDelete);
      seedIdsToDelete.forEach((id) => {
        exportCache.invalidateWork(id);
        removeWorkDraft(id);
      });
      removeReadingProgressEntries(seedIdsToDelete);
    }

    const remainingWorks = works.filter((w) => !SEED_WORK_IDS.has(w.id));
    const colIdsUsedByUserWorks = new Set(remainingWorks.map((w) => w.collectionId));

    const colsToDelete = collections.filter(
      (c) => SEED_COLLECTION_IDS.has(c.id) && !colIdsUsedByUserWorks.has(c.id)
    );
    for (const c of colsToDelete) {
      await dbDeleteCollection(c.id);
    }

    const deletedColIdSet = new Set(colsToDelete.map((c) => c.id));
    setWorks(remainingWorks);
    setCollections((prev) => prev.filter((c) => !deletedColIdSet.has(c.id)));

    if (deletedColIdSet.has(selectedCollectionId)) {
      setSelectedCollectionId('all');
      setSelectedCategory('all');
    }
    if (settings.defaultCollectionId && deletedColIdSet.has(settings.defaultCollectionId)) {
      await updateSettings({ defaultCollectionId: '' });
    }
    if (readingWorkId && SEED_WORK_IDS.has(readingWorkId)) {
      setReadingWorkId(null);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    const affectedWorks = works.filter((w) => w.collectionId === id);
    const reassignedAll = works.map((w) =>
      w.collectionId === id
        ? { ...w, collectionId: '', category: undefined, updatedAt: Date.now() }
        : w
    );

    if (affectedWorks.length > 0) {
      const modifiedForDb = await Promise.all(
        reassignedAll
          .filter((w) => affectedWorks.some((orig) => orig.id === w.id))
          .map(async (w) =>
            w.isPrivate && !w.isSealed && aesKey ? sealWorkItem(w, aesKey) : w
          )
      );
      await saveWorksBatch(modifiedForDb);
      affectedWorks.forEach((w) => exportCache.invalidateWork(w.id));
    }

    await dbDeleteCollection(id);
    setWorks(reassignedAll);
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (selectedCollectionId === id) {
      setSelectedCollectionId('all');
      setSelectedCategory('all');
    }
    if (settings.defaultCollectionId === id) {
      await updateSettings({ defaultCollectionId: '' });
    }
  };

  const handleAddCollectionCategory = async (colId: string, categoryName: string) => {
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    const target = collections.find((c) => c.id === colId);
    if (!target) return;
    const existing = target.categories || [];
    if (existing.includes(trimmed)) return;
    const updatedCol: Collection = {
      ...target,
      categories: [...existing, trimmed],
    };
    await saveCollection(updatedCol);
    setCollections((prev) => prev.map((c) => (c.id === colId ? updatedCol : c)));
  };

  const handleDeleteCollectionCategory = async (colId: string, categoryName: string) => {
    const target = collections.find((c) => c.id === colId);
    if (!target) return;
    const updatedCol: Collection = {
      ...target,
      categories: (target.categories || []).filter((cat) => cat !== categoryName),
    };
    await saveCollection(updatedCol);
    setCollections((prev) => prev.map((c) => (c.id === colId ? updatedCol : c)));

    const affectedWorks = works.filter(
      (w) => w.collectionId === colId && w.category === categoryName
    );
    if (affectedWorks.length > 0) {
      const affectedIds = new Set(affectedWorks.map((w) => w.id));
      const clearedWorks = works.map((w) =>
        affectedIds.has(w.id)
          ? { ...w, category: undefined, updatedAt: Date.now() }
          : w
      );
      const toPersist = await Promise.all(
        clearedWorks
          .filter((w) => affectedIds.has(w.id))
          .map(async (w) =>
            w.isPrivate && !w.isSealed && aesKey ? sealWorkItem(w, aesKey) : w
          )
      );
      await saveWorksBatch(toPersist);
      affectedWorks.forEach((w) => exportCache.invalidateWork(w.id));
      setWorks(clearedWorks);
    }

    if (selectedCollectionId === colId && selectedCategory === categoryName) {
      setSelectedCategory('all');
    }
  };

  const handleAddCustomTag = async (tag: string) => {
    const cleaned = tag.trim().replace(/^#+/, '');
    if (!cleaned) return;
    const current = settings.customTags ?? DEFAULT_SETTINGS.customTags ?? [];
    if (current.includes(cleaned)) return;
    await updateSettings({ customTags: [...current, cleaned] });
  };

  const handleRemoveCustomTag = async (tag: string) => {
    const current = settings.customTags ?? DEFAULT_SETTINGS.customTags ?? [];
    await updateSettings({ customTags: current.filter((t) => t !== tag) });
  };

  const handleSaveCustomShareTemplate = async (
    tpl: SavedShareTemplate,
    setAsDefault: boolean
  ) => {
    const existing = settings.savedShareTemplates ?? [];
    const nextList = [tpl, ...existing.filter((item) => item.id !== tpl.id)];
    await updateSettings({
      savedShareTemplates: nextList,
      ...(setAsDefault ? { defaultShareTemplateId: tpl.id } : {}),
    });
  };

  const handleDeleteCustomShareTemplate = async (id: string) => {
    const existing = settings.savedShareTemplates ?? [];
    const nextList = existing.filter((item) => item.id !== id);
    await updateSettings({
      savedShareTemplates: nextList,
      ...(settings.defaultShareTemplateId === id ? { defaultShareTemplateId: '' } : {}),
    });
  };

  const handleSetDefaultShareTemplate = async (id: string) => {
    await updateSettings({
      defaultShareTemplateId: settings.defaultShareTemplateId === id ? '' : id,
    });
  };

  const handleRestoreBackup = async (
    archive: BackupArchive,
    mode: 'merge' | 'replace'
  ) => {
    const normalizedImportedWorks: WorkItem[] = archive.works.map((w) => ({
      ...w,
      tags: Array.isArray(w.tags) ? w.tags : [],
      createdAt: w.createdAt || new Date().toISOString().slice(0, 10),
      updatedAt: typeof w.updatedAt === 'number' ? w.updatedAt : Date.now(),
    }));

    exportCache.clear();

    if (mode === 'replace') {
      await clearWorks();
      await clearCollections();
      clearAllWorkDrafts();
      clearAllReadingProgress();

      const cols = archive.collections.length > 0 ? archive.collections : SEED_COLLECTIONS;
      const worksForDb = await Promise.all(
        normalizedImportedWorks.map(async (w) =>
          w.isPrivate && !w.isSealed && aesKey ? sealWorkItem(w, aesKey) : w
        )
      );
      const worksForState = await Promise.all(
        normalizedImportedWorks.map(async (w) =>
          w.isPrivate && w.isSealed && aesKey ? unsealWorkItem(w, aesKey) : w
        )
      );

      await saveCollectionsBatch(cols);
      await saveWorksBatch(worksForDb);
      setCollections(cols);
      setWorks(worksForState);
      setReadingWorkId(null);
    } else {
      const existingColIds = new Set(collections.map((c) => c.id));
      const mergedCols = [...collections];
      for (const c of archive.collections) {
        if (!existingColIds.has(c.id)) mergedCols.push(c);
      }

      const workMap = new Map(works.map((w) => [w.id, w]));
      for (const w of normalizedImportedWorks) {
        workMap.set(w.id, w);
      }
      const mergedWorksRaw = Array.from(workMap.values()).sort(
        (a, b) => b.updatedAt - a.updatedAt
      );

      const worksForDb = await Promise.all(
        mergedWorksRaw.map(async (w) =>
          w.isPrivate && !w.isSealed && aesKey ? sealWorkItem(w, aesKey) : w
        )
      );
      const worksForState = await Promise.all(
        mergedWorksRaw.map(async (w) =>
          w.isPrivate && w.isSealed && aesKey ? unsealWorkItem(w, aesKey) : w
        )
      );

      await saveCollectionsBatch(mergedCols);
      await saveWorksBatch(worksForDb);
      setCollections(mergedCols);
      setWorks(worksForState);
    }
  };

  const activePanelFilterCount =
    (selectedCollectionId !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedGenre !== 'all' ? 1 : 0) +
    (selectedTag !== 'all' ? 1 : 0) +
    (selectedPeriod !== 'all' ? 1 : 0) +
    (sortOrder !== 'newest' ? 1 : 0);

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    filterScope !== 'all' ||
    activePanelFilterCount > 0;

  const resetPanelFilters = useCallback(() => {
    setSelectedCollectionId('all');
    setSelectedCategory('all');
    setSelectedGenre('all');
    setSelectedTag('all');
    setSelectedPeriod('all');
    setSortOrder('newest');
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setFilterScope('all');
    resetPanelFilters();
  }, [resetPanelFilters]);

  const openPdfExporter = useCallback((collectionId?: string) => {
    setPdfInitialCollectionId(collectionId);
    setPdfModalOpen(true);
  }, []);

  const openNewWorkEditor = useCallback((defaultColId?: string) => {
    setEditingWork(null);
    setEditorDefaultCollection(
      defaultColId !== undefined ? defaultColId : settings.defaultCollectionId || ''
    );
    setEditorOpen(true);
  }, [settings.defaultCollectionId]);

  const handleCreateNewWork = useCallback(() => {
    openNewWorkEditor();
  }, [openNewWorkEditor]);

  const privateWorksCount = works.filter((w) => w.isPrivate).length;
  const hasLockedWorks = works.some((w) => w.isPrivate && w.isSealed);
  const remainingSeedCount = useMemo(
    () => works.filter((w) => SEED_WORK_IDS.has(w.id)).length,
    [works]
  );

  if (!ready) {
    return (
      <MotionPreferencesProvider enabled={effectiveOverhaul}>
        <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2] dark:bg-[#111110]">
          <p className="font-editorial text-xl text-stone-500">拾光卷宗載入中...</p>
        </div>
      </MotionPreferencesProvider>
    );
  }

  const hasExportBarVisible = Boolean(activeTask || queuedTasks.length > 0);

  return (
    <MotionPreferencesProvider enabled={effectiveOverhaul}>
      <div className="min-h-dvh flex flex-col bg-[#F7F6F2] dark:bg-[#111110] text-stone-900 dark:text-stone-100">
      {/* SAFE MODE TOP BANNER */}
      {isSafeMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 sm:px-6 py-2 flex items-center justify-between text-xs text-amber-950 dark:text-amber-200 z-40 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              {isConciseCopy ? (
                <>已啟動<strong>安全模式</strong></>
              ) : (
                <>
                  已啟動「<strong>安全模式</strong>」：暫停重度特效與快取預熱，優先保障作品檢視、導出與完整備份。
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSafeModeActive(false);
              setIsSafeMode(false);
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] transition-colors shrink-0 whitespace-nowrap ml-2"
          >
            退出安全模式
          </button>
        </div>
      )}

      {/* DESKTOP TOP BAR (Strict 3-Zone Contract) */}
      <header className="hidden md:block sticky top-0 z-30 bg-[#F7F6F2]/98 dark:bg-[#111110]/98 border-b border-stone-200/80 dark:border-stone-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className="flex items-baseline gap-2 min-w-0 shrink-0 text-left"
          >
            <span className="font-editorial text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100 whitespace-nowrap truncate max-w-[240px]">
              {displayBrandTitle}
            </span>
            {isMinimalMode && (
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400 whitespace-nowrap shrink-0">
                · 極簡模式
              </span>
            )}
          </button>

          {/* Zone 2: Navigation links (2 tabs in Minimal Mode, 4 tabs in Standard Mode) */}
          <nav className="flex items-center gap-7 text-sm font-medium text-stone-600 dark:text-stone-400">
            {(isMinimalMode
              ? ([
                  { id: 'archive', label: '典藏作品' },
                  { id: 'vault', label: '備份與隱私' },
                ] as { id: ActiveTab; label: string }[])
              : ([
                  { id: 'archive', label: '典藏作品' },
                  { id: 'collections', label: '作品集整理' },
                  { id: 'studio', label: '圖卡工作室' },
                  { id: 'vault', label: '備份與隱私' },
                ] as { id: ActiveTab; label: string }[])
            ).map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'text-stone-950 dark:text-white'
                      : 'hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  {item.label}
                  {active &&
                    (effectiveOverhaul ? (
                      <SlidingNavIndicator
                        layoutId="desktop-nav-underline"
                        variant="desktop-underline"
                      />
                    ) : (
                      <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-[#284152] dark:bg-[#E7E5E0]" />
                    ))}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Export Live Progress Indicator + Primary Action + Statistics */}
          <div className="shrink-0 flex items-center gap-2.5">
            {(hasExportBarVisible || lastNotice) && (
              <button
                type="button"
                onClick={() => setExportPopoverOpen((o) => !o)}
                className={`min-h-[36px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                  activeTask
                    ? 'bg-white dark:bg-[#1E1E1C] border-[#284152]/40 dark:border-stone-600 text-stone-800 dark:text-stone-100'
                    : lastNotice?.status === 'error'
                    ? 'bg-[#9E3B33]/10 border-[#9E3B33]/30 text-[#9E3B33] dark:text-[#E07A70]'
                    : 'bg-white dark:bg-[#1E1E1C] border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200'
                }`}
              >
                {activeTask ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#284152] dark:text-[#E7E5E0] shrink-0" />
                    <span className="tabular-nums">
                      匯出 {activeTask.pct}%
                    </span>
                    {queuedTasks.length > 0 && (
                      <span className="text-[11px] text-stone-400 tabular-nums">
                        +{queuedTasks.length}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{lastNotice?.status === 'error' ? '匯出異常' : '匯出完成'}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => openNewWorkEditor()}
              className="px-4 py-2 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>收錄作品</span>
            </button>

            {!isMinimalMode && (
              <button
                type="button"
                onClick={() => setAnalyticsOpen(true)}
                aria-label="開啟典藏數據統計"
                title="典藏數據統計"
                className="h-9 px-3 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#191918] text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-medium inline-flex items-center gap-1.5 transition-all active:scale-95 whitespace-nowrap shrink-0"
              >
                <BarChart3 className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0]" />
                <span>統計</span>
              </button>
            )}
          </div>
        </div>

        {/* Hairline Top-Bar Export Progress Track */}
        {activeTask && (
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-stone-200/70 dark:bg-stone-800 overflow-hidden pointer-events-none">
            <div
              className="h-full bg-[#284152] dark:bg-[#E7E5E0] transition-all duration-150"
              style={{ width: `${activeTask.pct}%` }}
            />
          </div>
        )}
      </header>

      {/* MOBILE TOP APP BAR (Compact 52px + Safe Area) */}
      <header className="md:hidden sticky top-0 z-30 pt-safe bg-[#F7F6F2]/98 dark:bg-[#111110]/98 border-b border-stone-200/80 dark:border-stone-800/80">
        <div className="px-4 h-[52px] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={`flex items-baseline gap-1.5 min-w-0 shrink-0 text-left ${
              hasExportBarVisible || lastNotice ? 'max-w-[168px]' : 'max-w-[225px]'
            }`}
          >
            <span className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap truncate">
              {displayBrandTitle}
            </span>
            {isMinimalMode && (
              <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 whitespace-nowrap shrink-0">
                · 極簡模式
              </span>
            )}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {(hasExportBarVisible || lastNotice) && (
              <button
                type="button"
                onClick={() => setExportPopoverOpen((o) => !o)}
                aria-label="查看目前匯出進度"
                className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTask
                    ? 'bg-white dark:bg-[#1E1E1C] border-[#284152]/35 dark:border-stone-600 text-stone-800 dark:text-stone-100'
                    : lastNotice?.status === 'error'
                    ? 'bg-[#9E3B33]/10 border-[#9E3B33]/30 text-[#9E3B33] dark:text-[#E07A70]'
                    : 'bg-white dark:bg-[#1E1E1C] border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200'
                }`}
              >
                {activeTask ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-[#284152] dark:text-[#E7E5E0] shrink-0" />
                    <span className="tabular-nums">{activeTask.pct}%</span>
                    {queuedTasks.length > 0 && (
                      <span className="text-[10px] text-stone-400 tabular-nums">
                        +{queuedTasks.length}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>{lastNotice?.status === 'error' ? '異常' : '完成'}</span>
                  </>
                )}
              </button>
            )}

            {activeTab === 'archive' && (
              <button
                type="button"
                onClick={() => setShowMobileSearch((s) => !s)}
                aria-label="搜尋作品"
                className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-full text-stone-600 dark:text-stone-300"
              >
                <Search className="w-5 h-5" />
              </button>
            )}

            {settings.hasPin && (
              <button
                type="button"
                onClick={() => {
                  if (hasLockedWorks || !isVaultUnlocked) {
                    setPinModalState({ open: true, mode: 'unlock' });
                  } else {
                    void lockVault();
                  }
                }}
                aria-label={hasLockedWorks ? '解鎖私密作品' : '鎖定私密作品'}
                className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-full text-stone-600 dark:text-stone-300"
              >
                {hasLockedWorks || !isVaultUnlocked ? (
                  <Lock className="w-4 h-4 text-[#9E3B33] dark:text-[#E07A70]" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                void updateSettings({
                  theme: settings.theme === 'light' ? 'dark' : 'light',
                })
              }
              aria-label="切換淺色/深色模式"
              className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-full text-stone-600 dark:text-stone-300"
            >
              {settings.theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>

            {!isMinimalMode && (
              <button
                type="button"
                onClick={() => setAnalyticsOpen(true)}
                aria-label="開啟典藏數據統計"
                title="典藏數據統計"
                className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-full text-stone-700 dark:text-stone-200 active:scale-95 transition-transform"
              >
                <BarChart3 className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>
        </div>

        {/* Hairline Top-Bar Export Progress Track (Mobile) */}
        {activeTask && (
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-stone-200/70 dark:bg-stone-800 overflow-hidden pointer-events-none">
            <div
              className="h-full bg-[#284152] dark:bg-[#E7E5E0] transition-all duration-150"
              style={{ width: `${activeTask.pct}%` }}
            />
          </div>
        )}
      </header>

      {/* EXPANDABLE EXPORT PROGRESS & QUEUE POPOVER */}
      <AnimatePresence>
        {exportPopoverOpen && (activeTask || queuedTasks.length > 0 || lastNotice) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: effectiveOverhaul ? 0.2 : 0.1 }}
            className="fixed inset-0 z-40"
            onClick={() => setExportPopoverOpen(false)}
          >
            <motion.div
              initial={
                effectiveOverhaul
                  ? { opacity: 0, y: -12, scale: 0.94 }
                  : { opacity: 0, y: -4 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                effectiveOverhaul
                  ? { opacity: 0, y: -10, scale: 0.95 }
                  : { opacity: 0, y: -4 }
              }
              transition={{
                duration: effectiveOverhaul ? 0.24 : 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              onClick={(e) => e.stopPropagation()}
              className="fixed right-4 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] md:right-6 md:top-[68px] w-[calc(100vw-2rem)] max-w-sm rounded-2xl bg-white dark:bg-[#1B1B1A] border border-stone-200 dark:border-stone-800 shadow-2xl p-4 space-y-3 origin-top-right"
            >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                背景匯出工作列
              </span>
              <button
                type="button"
                onClick={() => setExportPopoverOpen(false)}
                aria-label="關閉匯出進度面板"
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeTask && (
              <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#242422] space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-stone-800 dark:text-stone-100 truncate">
                    {activeTask.title}
                  </span>
                  <span className="tabular-nums font-semibold text-[#284152] dark:text-[#E7E5E0] shrink-0">
                    {activeTask.pct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                  <div
                    className="h-full bg-[#284152] dark:bg-[#E7E5E0] transition-all duration-150"
                    style={{ width: `${activeTask.pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {isCardExportingPriority
                    ? '圖卡優先輸出中，背景任務暫停等候接續...'
                    : activeTask.label}
                </p>
              </div>
            )}

            {queuedTasks.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>等待佇列 ({queuedTasks.length}/{MAX_EXPORT_QUEUE_SIZE})</span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {queuedTasks.map((qt, idx) => {
                    const confirming = confirmCancelTaskId === qt.id;
                    return (
                      <div
                        key={qt.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#F7F6F2] dark:bg-[#242422] text-xs text-stone-700 dark:text-stone-300"
                      >
                        <span className="truncate tabular-nums">
                          {confirming ? (
                            <span className="text-[#9E3B33] dark:text-[#E07A70] font-medium">
                              確定移除「{qt.title}」？
                            </span>
                          ) : (
                            <>
                              #{idx + 1}
                              {qt.priority === 'high' ? ' [高優先]' : ''} · {qt.title}
                            </>
                          )}
                        </span>
                        {confirming ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                cancelQueuedTask(qt.id);
                                setConfirmCancelTaskId(null);
                              }}
                              className="px-2 py-0.5 rounded-md bg-[#9E3B33] text-white text-[11px] font-medium"
                            >
                              移除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelTaskId(null)}
                              className="px-1.5 py-0.5 text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                            >
                              保留
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelTaskId(qt.id)}
                            aria-label={`移除佇列任務 ${qt.title}`}
                            className="p-1 text-stone-400 hover:text-[#9E3B33] shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {lastNotice && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start justify-between gap-2 ${
                  lastNotice.status === 'success'
                    ? 'bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-stone-200'
                    : 'bg-[#9E3B33]/10 text-[#9E3B33] dark:text-[#E07A70]'
                }`}
              >
                <span className="leading-relaxed">{lastNotice.message}</span>
                <button
                  type="button"
                  onClick={() => {
                    dismissNotice();
                    if (!activeTask && queuedTasks.length === 0) {
                      setExportPopoverOpen(false);
                    }
                  }}
                  aria-label="清除通知"
                  className="p-0.5 opacity-70 hover:opacity-100 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT CANVAS */}
      <main
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 pb-28 md:pb-14 overflow-x-clip min-h-[calc(100dvh-52px)] md:min-h-[calc(100dvh-64px)]"
        onTouchStart={(e) => {
          if (settings.swipeTabNavigationEnabled === false) {
            swipeStartRef.current = null;
            return;
          }
          if (e.touches.length !== 1) {
            swipeStartRef.current = null;
            return;
          }
          const anyModalOpen =
            isAnyModalLocked() ||
            Boolean(readingWorkId) ||
            editorOpen ||
            filterModalOpen ||
            pdfModalOpen ||
            batchExplorerOpen ||
            analyticsOpen ||
            pinModalState.open ||
            welcomeOpen ||
            Boolean(shareModalWork) ||
            exportPopoverOpen;
          if (anyModalOpen) {
            swipeStartRef.current = null;
            return;
          }
          if (isInteractiveOrScrollableTarget(e.target, e.currentTarget)) {
            swipeStartRef.current = null;
            return;
          }
          const touch = e.touches[0];
          swipeStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
          };
        }}
        onTouchCancel={() => {
          swipeStartRef.current = null;
        }}
        onTouchEnd={(e) => {
          const start = swipeStartRef.current;
          swipeStartRef.current = null;
          if (!start || settings.swipeTabNavigationEnabled === false) return;
          const touch = e.changedTouches[0];
          if (!touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          const dt = Date.now() - start.time;
          if (dt <= 600 && Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
            const availableTabs: ActiveTab[] = isMinimalMode ? ['archive', 'vault'] : TAB_ORDER;
            const curIdx = availableTabs.indexOf(activeTab);
            if (curIdx < 0) return;
            if (dx < 0 && curIdx < availableTabs.length - 1) {
              setActiveTab(availableTabs[curIdx + 1]);
            } else if (dx > 0 && curIdx > 0) {
              setActiveTab(availableTabs[curIdx - 1]);
            }
          }
        }}
      >
        <AnimatePresence
          mode="wait"
          initial={false}
          custom={{ dir: tabDirection, overhaul: effectiveOverhaul }}
        >
          <motion.div
            key={activeTab}
            custom={{ dir: tabDirection, overhaul: effectiveOverhaul }}
            variants={TAB_TRANSITION_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
          >
        {activeTab === 'archive' && (
          <div className="space-y-4">
            {/* Compact Top Utility Strip: Random Spotlight + Archive Overview (hidden in Minimal Mode) */}
            <SmoothCollapse
              open={!isMinimalMode}
              animate={effectiveOverhaul}
              durationMs={220}
              innerClassName="space-y-2"
            >
                  <RandomSpotlightCard
                    works={works}
                    collections={collections}
                    conciseCopyMode={isConciseCopy}
                    onSelectWork={handleSelectWork}
                  />
                  <ArchiveStatsOverview works={works} />
            </SmoothCollapse>

            {/* Editorial Workspace Header & Search / Filter Toolbar */}
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 text-balance">
                    {isMinimalMode ? '典藏作品' : '個人攝影與文字典藏'}
                  </h1>
                  <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1 tabular-nums">
                    {isConciseCopy || isMinimalMode ? (
                      <>
                        {works.length} 件作品
                        {privateWorksCount > 0 ? ` · ${privateWorksCount} 私密` : ''}
                      </>
                    ) : (
                      <>
                        共收錄 {works.length} 件作品 · {collections.length} 個作品集
                        {privateWorksCount > 0 ? ` · ${privateWorksCount} 件私密加密` : ''}
                      </>
                    )}
                  </p>
                </div>

                {/* Desktop Search & Quick Theme/Lock Actions */}
                <div className="hidden md:flex items-center gap-2.5">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={isConciseCopy ? '搜尋作品...' : '搜尋標題、內文、相機或標籤...'}
                      className="w-full h-10 pl-9 pr-8 rounded-xl bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#284152]/20"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="清除搜尋"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {settings.hasPin && (
                    <button
                      type="button"
                      onClick={() => {
                        if (hasLockedWorks || !isVaultUnlocked) {
                          setPinModalState({ open: true, mode: 'unlock' });
                        } else {
                          void lockVault();
                        }
                      }}
                      className="h-10 px-3.5 rounded-xl bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-800 text-xs font-medium inline-flex items-center gap-1.5 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 whitespace-nowrap"
                    >
                      {hasLockedWorks || !isVaultUnlocked ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-[#9E3B33] dark:text-[#E07A70]" />
                          <span>解鎖私密</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>立即鎖定</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void updateSettings({
                        theme: settings.theme === 'light' ? 'dark' : 'light',
                      })
                    }
                    aria-label="切換閱讀色調"
                    className="h-10 w-10 rounded-xl bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                  >
                    {settings.theme === 'light' ? (
                      <Moon className="w-4 h-4" />
                    ) : (
                      <Sun className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Mobile Expandable Search Input */}
              <SmoothCollapse
                open={showMobileSearch}
                animate={effectiveOverhaul}
                durationMs={220}
                className="md:hidden"
              >
                    <div className="relative">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus={showMobileSearch}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={isConciseCopy ? '搜尋作品...' : '搜尋標題、詩句、相機、地點或標籤...'}
                        className="w-full min-h-[44px] pl-10 pr-10 rounded-xl bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="清除搜尋"
                          className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-stone-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
              </SmoothCollapse>

              {/* Main Toolbar: Scope Tabs + View/Filter Row */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 pt-1">
                <div
                  className={`grid ${
                    isMinimalMode ? 'grid-cols-4' : 'grid-cols-5'
                  } md:inline-flex items-center gap-1 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#1D1D1B]`}
                >
                  {(
                    [
                      { id: 'all', label: '全部' },
                      { id: 'photography', label: '攝影' },
                      { id: 'writing', label: '文字' },
                      ...(isMinimalMode ? [] : [{ id: 'favorite' as FilterScope, label: '精選' }]),
                      { id: 'private', label: '私密' },
                    ] as { id: FilterScope; label: string }[]
                  ).map((tab) => {
                    const isActive = filterScope === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setFilterScope(tab.id);
                          if (tab.id === 'photography' && selectedGenre !== 'all') {
                            setSelectedGenre('all');
                          }
                        }}
                        className={`relative min-h-[38px] px-2 md:px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors flex items-center justify-center ${
                          isActive
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                        }`}
                      >
                        {isActive && <SlidingPill layoutId="archive-scope-pill" />}
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {!isMinimalMode && (
                  <div className="flex items-center justify-between md:justify-end gap-2 shrink-0">
                    {/* View Switcher: Gallery Archive vs Geographic Distribution */}
                    <div
                      role="group"
                      aria-label="顯示視角切換"
                      className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#1D1D1B]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (settings.layout === 'map') {
                            void updateSettings({ layout: lastGalleryLayout });
                          }
                        }}
                        className={`relative min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                          settings.layout !== 'map'
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                        }`}
                        title="切換至作品畫廊列表"
                      >
                        {settings.layout !== 'map' && (
                          <SlidingPill layoutId="archive-view-pill" />
                        )}
                        <LayoutGrid className="w-3.5 h-3.5 shrink-0 relative z-10" />
                        <span className="relative z-10">典藏畫廊</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (settings.layout !== 'map') {
                            void updateSettings({ layout: 'map' });
                          }
                        }}
                        className={`relative min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                          settings.layout === 'map'
                            ? 'text-white dark:text-stone-900'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                        }`}
                        title="切換至地理分佈地圖與區域列表"
                      >
                        {settings.layout === 'map' && (
                          <SlidingPill
                            layoutId="archive-view-pill"
                            className="bg-[#284152] dark:bg-[#E7E5E0] shadow-sm rounded-lg"
                          />
                        )}
                        <MapPin className="w-3.5 h-3.5 shrink-0 relative z-10" />
                        <span className="relative z-10">地理分佈</span>
                      </button>
                    </div>

                    {/* Consolidated Filter & Layout Modal Button */}
                    <button
                      type="button"
                      onClick={() => setFilterModalOpen(true)}
                      className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                        activePanelFilterCount > 0
                          ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-stone-100'
                          : 'border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#191918] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        篩選器{activePanelFilterCount > 0 ? ` (${activePanelFilterCount})` : ''}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Archive Results */}
            <ArchiveLayouts
              works={filteredWorks}
              collections={collections}
              layout={
                isMinimalMode && settings.layout === 'map'
                  ? lastGalleryLayout
                  : settings.layout
              }
              filterTransitionKey={filterScope}
              onSelectWork={handleSelectWork}
              onToggleFavorite={isMinimalMode ? undefined : handleToggleFavorite}
              onCreateNew={handleCreateNewWork}
              hasActiveFilter={hasActiveFilter}
              onClearFilter={clearFilters}
            />
          </div>
        )}

        {!isMinimalMode && activeTab === 'collections' && (
          <CollectionsManager
            collections={collections}
            works={works}
            conciseCopyMode={isConciseCopy}
            onCreateCollection={handleCreateCollection}
            onUpdateCollection={handleUpdateCollection}
            onReorderCollections={handleReorderCollections}
            onDeleteCollection={handleDeleteCollection}
            onAddCategory={handleAddCollectionCategory}
            onDeleteCategory={handleDeleteCollectionCategory}
            onOpenCollection={(colId, category) => {
              setSelectedCollectionId(colId);
              setSelectedCategory(category || 'all');
              setFilterScope('all');
              setActiveTab('archive');
            }}
            onAddWorkInCollection={(colId) => openNewWorkEditor(colId)}
            onExportCollectionPdf={(colId) => openPdfExporter(colId)}
            onOpenBatchExplorer={() => setBatchExplorerOpen(true)}
          />
        )}

        {!isMinimalMode && activeTab === 'studio' && (
          <TabErrorBoundary resetKey="studio" label="圖卡工作室">
            <ShareCardStudio
              works={works}
              collections={collections}
              initialWork={null}
              authorName={settings.authorName}
              sealText={settings.sealText}
              conciseCopyMode={isConciseCopy}
              savedTemplates={settings.savedShareTemplates ?? []}
              defaultTemplateId={settings.defaultShareTemplateId ?? ''}
              onSaveCustomTemplate={handleSaveCustomShareTemplate}
              onDeleteCustomTemplate={handleDeleteCustomShareTemplate}
              onSetDefaultTemplate={handleSetDefaultShareTemplate}
            />
          </TabErrorBoundary>
        )}

        {activeTab === 'vault' && (
          <TabErrorBoundary resetKey="vault" label="備份與隱私">
            <VaultAndBackupView
              works={works}
              collections={collections}
              settings={settings}
              isVaultUnlocked={isVaultUnlocked && !hasLockedWorks}
              onUpdateSettings={updateSettings}
              onSetupPin={() => {
                if (settings.hasPin && (hasLockedWorks || !isVaultUnlocked)) {
                  setPinModalState({
                    open: true,
                    mode: 'unlock',
                    pendingAction: 'change-pin',
                  });
                } else {
                  setPinModalState({ open: true, mode: 'setup' });
                }
              }}
              onDisablePin={() => setPinModalState({ open: true, mode: 'verify-disable' })}
              onUnlockVault={() => setPinModalState({ open: true, mode: 'unlock' })}
              onLockVault={() => void lockVault()}
              onRestoreBackup={handleRestoreBackup}
              onOpenPdfExporter={() => openPdfExporter()}
              remainingSeedCount={remainingSeedCount}
              onClearSeedWorks={handleClearSeedWorks}
              onOpenWelcome={() => setWelcomeOpen(true)}
            />
          </TabErrorBoundary>
        )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* MOBILE FLOATING ADD BUTTON (Quick thumb-reach create action when FAB mode is selected) */}
      <AnimatePresence>
        {(() => {
          const addBtnPos: AddButtonPosition = settings.addButtonPosition || 'fab-right';
          const isFab = addBtnPos === 'fab-right' || addBtnPos === 'fab-left';
          if (!isFab || (activeTab !== 'archive' && activeTab !== 'collections')) return null;
          return (
            <motion.button
              key="mobile-fab-add"
              type="button"
              onClick={() => openNewWorkEditor()}
              aria-label="收錄新作品"
              initial={effectiveOverhaul ? { opacity: 0, scale: 0.72, y: 20 } : false}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={effectiveOverhaul ? { opacity: 0, scale: 0.75, y: 16 } : { opacity: 0 }}
              whileTap={{ scale: 0.92 }}
              transition={
                effectiveOverhaul
                  ? { type: 'spring', stiffness: 360, damping: 26 }
                  : { duration: 0.14 }
              }
              style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
              className={`md:hidden fixed z-30 w-13 h-13 rounded-full bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 shadow-lg flex items-center justify-center ${
                addBtnPos === 'fab-left' ? 'left-4' : 'right-4'
              }`}
            >
              <Plus className="w-6 h-6" />
            </motion.button>
          );
        })()}
      </AnimatePresence>

      {/* MOBILE FIXED BOTTOM NAVIGATION BAR (Ergonomic Thumb Zone) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe bg-[#F7F6F2]/98 dark:bg-[#141413]/98 border-t border-stone-200/80 dark:border-stone-800/80 [transform:translate3d(0,0,0)] [contain:layout_style]">
        {(() => {
          const addBtnPos: AddButtonPosition = settings.addButtonPosition || 'fab-right';
          const navTabs: {
            id: ActiveTab;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }[] = isMinimalMode
            ? [
                { id: 'archive', label: '典藏', icon: Archive },
                { id: 'vault', label: '備份', icon: ShieldCheck },
              ]
            : [
                { id: 'archive', label: '典藏', icon: Archive },
                { id: 'collections', label: '整理', icon: FolderKanban },
                { id: 'studio', label: '圖卡', icon: Images },
                { id: 'vault', label: '備份', icon: ShieldCheck },
              ];
          const slots: Array<
            | { kind: 'tab'; id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }
            | { kind: 'add' }
          > = navTabs.map((t) => ({ kind: 'tab', ...t }));

          if (addBtnPos === 'nav-left') {
            slots.unshift({ kind: 'add' });
          } else if (addBtnPos === 'nav-center') {
            slots.splice(Math.floor(slots.length / 2), 0, { kind: 'add' });
          } else if (addBtnPos === 'nav-right') {
            slots.push({ kind: 'add' });
          }

          return (
            <div
              className={`grid ${
                slots.length === 5
                  ? 'grid-cols-5'
                  : slots.length === 4
                  ? 'grid-cols-4'
                  : slots.length === 3
                  ? 'grid-cols-3'
                  : 'grid-cols-2'
              } h-14 items-center`}
            >
              {slots.map((slot) => {
                if (slot.kind === 'add') {
                  return (
                    <button
                      key="__add__"
                      type="button"
                      onClick={() => openNewWorkEditor()}
                      aria-label="收錄新作品"
                      className="h-full flex flex-col items-center justify-center active:scale-95 transition-transform"
                    >
                      <span className="w-10 h-10 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 shadow-sm flex items-center justify-center">
                        <Plus className="w-5 h-5 stroke-[2.3]" />
                      </span>
                    </button>
                  );
                }
                const Icon = slot.icon;
                const active = activeTab === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setActiveTab(slot.id)}
                    className={`relative h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                      active
                        ? 'text-[#284152] dark:text-[#E7E5E0]'
                        : 'text-stone-400 dark:text-stone-500'
                    }`}
                  >
                    {active && effectiveOverhaul && (
                      <SlidingNavIndicator
                        layoutId="mobile-nav-indicator"
                        variant="mobile-top-bar"
                      />
                    )}
                    <Icon className={`w-5 h-5 ${active ? 'stroke-[2.2]' : 'stroke-[1.7]'}`} />
                    <span className="text-[11px] font-medium tracking-tight">{slot.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </nav>

      {/* DISTRACTION-FREE WORK READER & LIGHTBOX */}
      <WorkReaderModal
        work={readingWork}
        collections={collections}
        authorName={settings.authorName}
        sealText={settings.sealText}
        defaultMarkdownEnabled={settings.defaultMarkdownEnabled ?? true}
        conciseCopyMode={isConciseCopy}
        minimalMode={isMinimalMode}
        onClose={() => setReadingWorkId(null)}
        onEdit={(w) => {
          setEditingWork(w);
          setEditorOpen(true);
        }}
        onDelete={(w) => void handleDeleteWork(w)}
        onToggleFavorite={(w) => void handleToggleFavorite(w)}
        onTogglePrivate={(w) => void handleTogglePrivate(w)}
        onToggleMarkdown={(w) => void handleToggleMarkdown(w)}
        onOpenShareStudio={(w) => {
          setReadingWorkId(null);
          setShareModalWork(w);
        }}
      />

      {/* CREATE / EDIT WORK MODAL */}
      <WorkEditorModal
        isOpen={editorOpen}
        editingWork={editingWork}
        collections={collections}
        defaultCollectionId={editorDefaultCollection}
        defaultNewWorkType={settings.defaultNewWorkType ?? 'photography'}
        defaultUntitledTitle={settings.defaultUntitledTitle ?? '無題'}
        conciseCopyMode={isConciseCopy}
        minimalMode={isMinimalMode}
        presetTags={settings.presetTags ?? DEFAULT_PRESET_TAGS}
        customTags={settings.customTags ?? DEFAULT_SETTINGS.customTags ?? []}
        hasPin={settings.hasPin}
        defaultMarkdownEnabled={settings.defaultMarkdownEnabled ?? true}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveWork}
        onAddCustomTag={handleAddCustomTag}
        onRemoveCustomTag={handleRemoveCustomTag}
        onAddCollectionCategory={handleAddCollectionCategory}
        onRequestSetupPin={() => setPinModalState({ open: true, mode: 'setup' })}
      />

      {/* SHARE CARD MODAL WHEN LAUNCHED DIRECTLY FROM A WORK */}
      {!isMinimalMode && shareModalWork && (
        <TabErrorBoundary resetKey={shareModalWork.id} label="分享圖卡工作室">
          <ShareCardStudio
            works={works}
            collections={collections}
            initialWork={shareModalWork}
            authorName={settings.authorName}
            sealText={settings.sealText}
            conciseCopyMode={isConciseCopy}
            savedTemplates={settings.savedShareTemplates ?? []}
            defaultTemplateId={settings.defaultShareTemplateId ?? ''}
            onSaveCustomTemplate={handleSaveCustomShareTemplate}
            onDeleteCustomTemplate={handleDeleteCustomShareTemplate}
            onSetDefaultTemplate={handleSetDefaultShareTemplate}
            isModal
            onClose={() => setShareModalWork(null)}
          />
        </TabErrorBoundary>
      )}

      {/* CONSOLIDATED ARCHIVE FILTER & LAYOUT MODAL */}
      {!isMinimalMode && (
        <ArchiveFilterModal
          isOpen={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          resultCount={filteredWorks.length}
          layout={settings.layout}
          onChangeLayout={(layout) => void updateSettings({ layout })}
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          onChangeCollectionId={(id) => {
            setSelectedCollectionId(id);
            setSelectedCategory('all');
          }}
          selectedCategory={selectedCategory}
          onChangeCategory={setSelectedCategory}
          availableCategories={availableCategoriesForSelectedCollection}
          selectedGenre={selectedGenre}
          onChangeGenre={(genre) => {
            setSelectedGenre(genre);
            if (genre !== 'all' && filterScope === 'photography') {
              setFilterScope('writing');
            }
          }}
          availableGenres={availableGenres}
          selectedTag={selectedTag}
          onChangeTag={setSelectedTag}
          availableTags={availableTags}
          selectedPeriod={selectedPeriod}
          onChangePeriod={setSelectedPeriod}
          availableYears={availableYears}
          availableMonths={availableMonths}
          sortOrder={sortOrder}
          onChangeSortOrder={setSortOrder}
          onResetFilters={resetPanelFilters}
          conciseCopyMode={isConciseCopy}
        />
      )}

      {/* PDF E-BOOK EXPORTER MODAL */}
      {!isMinimalMode && (
        <PdfEbookModal
          isOpen={pdfModalOpen}
          works={works}
          collections={collections}
          authorName={settings.authorName}
          sealText={settings.sealText}
          initialCollectionId={pdfInitialCollectionId}
          onClose={() => setPdfModalOpen(false)}
        />
      )}

      {/* BATCH WORK EXPLORER MODAL */}
      {!isMinimalMode && (
        <BatchWorkExplorerModal
          isOpen={batchExplorerOpen}
          onClose={() => setBatchExplorerOpen(false)}
          works={works}
          collections={collections}
          presetTags={settings.presetTags ?? DEFAULT_PRESET_TAGS}
          customTags={settings.customTags ?? DEFAULT_SETTINGS.customTags ?? []}
          hasPin={settings.hasPin}
          isVaultUnlocked={isVaultUnlocked && !hasLockedWorks}
          onRequestSetupPin={() => setPinModalState({ open: true, mode: 'setup' })}
          onRequestUnlockVault={() => setPinModalState({ open: true, mode: 'unlock' })}
          onBatchUpdateWorks={handleBatchUpdateWorks}
          onBatchDeleteWorks={handleBatchDeleteWorks}
          onAddCustomTag={handleAddCustomTag}
        />
      )}

      {/* ARCHIVE ANALYTICS & STATISTICS MODAL */}
      {!isMinimalMode && (
        <AnalyticsModal
          isOpen={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
          works={works}
          collections={collections}
          conciseCopyMode={isConciseCopy}
        />
      )}

      {/* WELCOME / ONBOARDING MODAL */}
      <WelcomeModal
        isOpen={welcomeOpen}
        brandTitle={displayBrandTitle}
        remainingSeedCount={remainingSeedCount}
        onClose={() => setWelcomeOpen(false)}
        onClearSeedWorks={handleClearSeedWorks}
      />

      {/* PIN / PRIVACY LOCK MODAL */}
      <PinLockModal
        isOpen={pinModalState.open}
        mode={pinModalState.mode}
        onClose={() => setPinModalState({ open: false, mode: 'unlock' })}
        onSubmitPin={handlePinSubmit}
      />

      {/* CRASH AUTO-RECOVERY DIALOG */}
      {showCrashPrompt && (
        <div
          data-no-swipe="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 overscroll-contain touch-none"
        >
          <div className="max-w-md w-full bg-white dark:bg-[#191918] rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-6 space-y-4 overscroll-contain touch-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  異常防護與回復
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  偵測到前次應用非預期中斷，本地作品完整無損
                </p>
              </div>
            </div>

            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
              是否要進入「安全模式」啟動？在安全模式下將暫停重度特效、動畫與快取預熱，以純淨基礎資料運作，保障隨時能存取與備份作品。
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSafeModeActive(true);
                  setIsSafeMode(true);
                  dismissPendingCrashPrompt();
                  setShowCrashPrompt(false);
                }}
                className="flex-1 min-h-[42px] px-4 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium hover:opacity-95"
              >
                進入安全模式啟動
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissPendingCrashPrompt();
                  setShowCrashPrompt(false);
                }}
                className="min-h-[42px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                正常模式啟動
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </MotionPreferencesProvider>
  );
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ExportQueueProvider>
        <AppShell />
      </ExportQueueProvider>
    </GlobalErrorBoundary>
  );
}
