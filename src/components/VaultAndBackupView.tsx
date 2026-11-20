import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Edit2,
  Feather,
  FlaskConical,
  FolderArchive,
  HardDrive,
  Lock,
  Moon,
  Plus,
  RotateCcw,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  Tag,
  Terminal,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { MAX_EXPORT_QUEUE_SIZE, useExportQueue } from '../contexts/ExportQueueContext';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { BottomSheet } from './BottomSheet';
import { SlidingPill } from './SlidingPill';
import { SmoothCollapse } from './SmoothCollapse';
import { exportCache } from '../services/exportCache';
import {
  DEFAULT_PRESET_TAGS,
  exportCrossPlatformZipBackup,
  exportFullBackup,
  parseBackupFile,
} from '../services/storage';
import {
  AddButtonPosition,
  AppSettings,
  BackupArchive,
  Collection,
  WorkItem,
  WorkType,
} from '../types';
import { DeveloperPerfDashboard } from './DeveloperPerfDashboard';

const SmoothConciseNote: React.FC<{
  show: boolean;
  animate: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({
  show,
  animate,
  children,
  className = 'text-[11px] text-stone-400 mt-0.5 leading-relaxed',
}) => (
  <SmoothCollapse open={show} animate={animate} durationMs={200}>
    <p className={className}>{children}</p>
  </SmoothCollapse>
);

interface VaultAndBackupViewProps {
  works: WorkItem[];
  collections: Collection[];
  settings: AppSettings;
  isVaultUnlocked: boolean;
  onUpdateSettings: (next: Partial<AppSettings>) => Promise<void>;
  onSetupPin: () => void;
  onDisablePin: () => void;
  onUnlockVault: () => void;
  onLockVault: () => void;
  onRestoreBackup: (archive: BackupArchive, mode: 'merge' | 'replace') => Promise<void>;
  onOpenPdfExporter: () => void;
  remainingSeedCount: number;
  onClearSeedWorks: () => Promise<void>;
  onOpenWelcome: () => void;
}

export const VaultAndBackupView: React.FC<VaultAndBackupViewProps> = ({
  works,
  collections,
  settings,
  isVaultUnlocked,
  onUpdateSettings,
  onSetupPin,
  onDisablePin,
  onUnlockVault,
  onLockVault,
  onRestoreBackup,
  onOpenPdfExporter,
  remainingSeedCount,
  onClearSeedWorks,
  onOpenWelcome,
}) => {
  const {
    activeTask,
    queuedTasks,
    lastNotice,
    isCardExportingPriority,
    enqueueTask,
    cancelQueuedTask,
  } = useExportQueue();

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSInstallGuide, setShowIOSInstallGuide] = useState(false);
  useBodyScrollLock(showIOSInstallGuide);
  const [confirmClearSeed, setConfirmClearSeed] = useState(false);
  const [clearingSeed, setClearingSeed] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [lastSubmittedAt, setLastSubmittedAt] = useState(0);
  const [pendingArchive, setPendingArchive] = useState<BackupArchive | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hidden Developer Options (persisted via settings.devOptionsEnabled; toggled by rapid 5 taps on Privacy Lock Shield icon)
  const devOptionsOpen = Boolean(settings.devOptionsEnabled);
  const [devUnlockHint, setDevUnlockHint] = useState('');
  const shieldTapRef = useRef<{ count: number; lastTapAt: number }>({
    count: 0,
    lastTapAt: 0,
  });

  // Tag Management & Queue Confirmation State
  const [newPresetInput, setNewPresetInput] = useState('');
  const [newCustomInput, setNewCustomInput] = useState('');
  const [editingTag, setEditingTag] = useState<{
    group: 'preset' | 'custom';
    oldValue: string;
    draft: string;
  } | null>(null);
  const [pendingDeleteTag, setPendingDeleteTag] = useState<{
    group: 'preset' | 'custom';
    tag: string;
  } | null>(null);
  const [confirmCancelTaskId, setConfirmCancelTaskId] = useState<string | null>(null);

  // Collapsible secondary setting sections (collapsed by default to keep page clean; developer stays expanded once opened)
  const [expandedSections, setExpandedSections] = useState<{
    appearance: boolean;
    identity: boolean;
    tags: boolean;
    onboarding: boolean;
    developer: boolean;
  }>({
    appearance: false,
    identity: false,
    tags: false,
    onboarding: false,
    developer: false,
  });

  useEffect(() => {
    if (!lastNotice || lastSubmittedAt === 0) return;
    if (lastNotice.finishedAt >= lastSubmittedAt) {
      setBackupFeedback({
        type: lastNotice.status === 'success' ? 'success' : 'error',
        text: lastNotice.message,
      });
    }
  }, [lastNotice, lastSubmittedAt]);

  const toggleSection = (
    key: 'appearance' | 'identity' | 'tags' | 'onboarding' | 'developer'
  ) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleShieldTap = () => {
    if (settings.minimalMode) return;
    const now = Date.now();
    const { count, lastTapAt } = shieldTapRef.current;
    const nextCount = now - lastTapAt <= 1400 ? count + 1 : 1;

    if (nextCount >= 5) {
      shieldTapRef.current = { count: 0, lastTapAt: 0 };
      const nextOpen = !devOptionsOpen;
      void onUpdateSettings({ devOptionsEnabled: nextOpen });
      if (nextOpen) {
        setExpandedSections((prev) => ({ ...prev, developer: true }));
      }
      setDevUnlockHint(
        nextOpen
          ? '已開啟「開發者選項」（常駐顯示，再次於此護盾連點 5 下可隱藏）。'
          : '已隱藏「開發者選項」。'
      );
    } else {
      shieldTapRef.current = { count: nextCount, lastTapAt: now };
    }
  };

  const presetTags = Array.isArray(settings.presetTags)
    ? settings.presetTags
    : DEFAULT_PRESET_TAGS;
  const customTags = Array.isArray(settings.customTags) ? settings.customTags : [];
  const defaultMarkdownEnabled = settings.defaultMarkdownEnabled ?? true;
  const isConciseCopy = Boolean(settings.conciseCopyMode);
  const isMinimalMode = Boolean(settings.minimalMode);
  const { animationOverhaul } = useMotionPreferences();
  const isAnimationOverhaul = Boolean(settings.animationOverhaul);

  const photoCount = works.filter((w) => w.type === 'photography').length;
  const writingCount = works.filter((w) => w.type === 'writing').length;
  const privateCount = works.filter((w) => w.isPrivate).length;
  const isQueueFull = queuedTasks.length >= MAX_EXPORT_QUEUE_SIZE;

  const handleExportZip = () => {
    setExportMenuOpen(false);
    const snapshotWorks = [...works];
    const snapshotCollections = [...collections];
    const snapshotAuthor = settings.authorName;

    setLastSubmittedAt(Date.now());
    const result = enqueueTask({
      kind: 'zip',
      title: `跨平台備份包 (.zip · ${snapshotWorks.length} 件)`,
      run: async ({ onProgress, yieldAndRespectPriority }) => {
        const res = await exportCrossPlatformZipBackup(
          snapshotWorks,
          snapshotCollections,
          snapshotAuthor,
          {
            onProgress,
            yieldHook: yieldAndRespectPriority,
          }
        );
        await onUpdateSettings({ lastBackupAt: Date.now() });
        const kb = Math.max(1, Math.round(res.byteSize / 1024));
        return `跨平台備份包匯出完成（${kb.toLocaleString()} KB），已儲存於：${res.locationLabel}`;
      },
    });

    if (!result.accepted) {
      setBackupFeedback({ type: 'error', text: result.message });
    } else if (result.status === 'queued') {
      setBackupFeedback({ type: 'info', text: result.message });
    } else {
      setBackupFeedback(null);
    }
  };

  const handleExportJson = () => {
    setExportMenuOpen(false);
    const snapshotWorks = [...works];
    const snapshotCollections = [...collections];
    const snapshotAuthor = settings.authorName;

    setLastSubmittedAt(Date.now());
    const result = enqueueTask({
      kind: 'json',
      title: `標準備份檔 (.json · ${snapshotWorks.length} 件)`,
      run: async ({ onProgress, yieldAndRespectPriority }) => {
        const res = await exportFullBackup(
          snapshotWorks,
          snapshotCollections,
          snapshotAuthor,
          {
            onProgress,
            yieldHook: yieldAndRespectPriority,
          }
        );
        await onUpdateSettings({ lastBackupAt: Date.now() });
        const kb = Math.max(1, Math.round(res.byteSize / 1024));
        return `JSON 備份完成（${kb.toLocaleString()} KB），已儲存於：${res.locationLabel}`;
      },
    });

    if (!result.accepted) {
      setBackupFeedback({ type: 'error', text: result.message });
    } else if (result.status === 'queued') {
      setBackupFeedback({ type: 'info', text: result.message });
    } else {
      setBackupFeedback(null);
    }
  };

  const handleCreateSimulatedExportTask = () => {
    setLastSubmittedAt(Date.now());
    const result = enqueueTask({
      kind: 'simulated',
      title: '開發測試 · 10 秒模擬匯出',
      run: async ({ onProgress, yieldAndRespectPriority }) => {
        const totalSteps = 100;
        for (let step = 1; step <= totalSteps; step++) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
          await yieldAndRespectPriority();
          const elapsedSec = (step * 0.1).toFixed(1);
          onProgress(
            `模擬大型作品集整理中 (${elapsedSec} / 10.0 秒 · 不會寫入實際檔案)...`,
            step
          );
        }
        return '已完成 10 秒無真實匯出模擬測試（未產生任何檔案）。';
      },
    });

    setBackupFeedback({
      type: result.accepted ? 'info' : 'error',
      text: result.message,
    });
  };

  const handlePickBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupFeedback(null);
    try {
      const archive = await parseBackupFile(file);
      setPendingArchive(archive);
    } catch (err) {
      setBackupFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : '無法讀取備份檔',
      });
    } finally {
      e.target.value = '';
    }
  };

  const confirmRestore = async (mode: 'merge' | 'replace') => {
    if (!pendingArchive) return;
    setImporting(true);
    try {
      await onRestoreBackup(pendingArchive, mode);
      setBackupFeedback({
        type: 'success',
        text: `已成功${mode === 'merge' ? '合併匯入' : '覆蓋還原'} ${
          pendingArchive.works.length
        } 件作品。`,
      });
      setPendingArchive(null);
    } catch (err) {
      setBackupFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : '還原失敗',
      });
    } finally {
      setImporting(false);
    }
  };

  // Tag Management Handlers
  const handleAddPresetTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newPresetInput.trim().replace(/^#+/, '');
    if (!cleaned) return;
    if (!presetTags.includes(cleaned)) {
      await onUpdateSettings({ presetTags: [...presetTags, cleaned] });
    }
    setNewPresetInput('');
  };

  const handleDeletePresetTag = async (tag: string) => {
    await onUpdateSettings({ presetTags: presetTags.filter((t) => t !== tag) });
  };

  const handleAddCustomTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newCustomInput.trim().replace(/^#+/, '');
    if (!cleaned) return;
    if (!customTags.includes(cleaned)) {
      await onUpdateSettings({ customTags: [...customTags, cleaned] });
    }
    setNewCustomInput('');
  };

  const handleDeleteCustomTag = async (tag: string) => {
    await onUpdateSettings({ customTags: customTags.filter((t) => t !== tag) });
  };

  const handleSaveTagRename = async () => {
    if (!editingTag) return;
    const cleaned = editingTag.draft.trim().replace(/^#+/, '');
    if (!cleaned) {
      setEditingTag(null);
      return;
    }
    if (editingTag.group === 'preset') {
      const next = presetTags.map((t) => (t === editingTag.oldValue ? cleaned : t));
      await onUpdateSettings({ presetTags: Array.from(new Set(next)) });
    } else {
      const next = customTags.map((t) => (t === editingTag.oldValue ? cleaned : t));
      await onUpdateSettings({ customTags: Array.from(new Set(next)) });
    }
    setEditingTag(null);
  };

  const lastBackupText = settings.lastBackupAt
    ? new Date(settings.lastBackupAt).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '尚未執行手動備份';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="border-b border-stone-200/80 dark:border-stone-800 pb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
            離線備份與隱私金庫
          </h2>
          {!isConciseCopy && (
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              所有資料皆儲存於您的本機裝置，不依賴任何雲端帳號或網路連線。
            </p>
          )}
        </div>
        {isMinimalMode && (
          <button
            type="button"
            onClick={() => void onUpdateSettings({ minimalMode: false })}
            className="min-h-[36px] px-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#191918] text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
          >
            退出極簡模式
          </button>
        )}
      </div>

      {/* Stats Strip (hidden in Minimal Mode) */}
      {!isMinimalMode && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '攝影底片', value: photoCount },
            { label: '文字稿件', value: writingCount },
            { label: '作品集數', value: collections.length },
            { label: '私密加密', value: privateCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800"
            >
              <div className="text-xs text-stone-500 dark:text-stone-400">{stat.label}</div>
              <div className="font-editorial text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100 mt-1">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Offline Backup Card (2 Clean Buttons: 匯出 & 備份 / 匯入) */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-stone-700 dark:text-stone-300 shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
              {isConciseCopy ? '離線備份與還原' : '跨平台離線備份系統（PC / 手機通用）'}
            </h3>
            {!isConciseCopy && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                {isMinimalMode
                  ? '支援匯出跨平台壓縮包與標準 JSON 備份檔，或從備份還原作品。'
                  : '支援跨平台整理壓縮包（含照片與 Markdown）、標準 JSON 備份，以及排版為離線 PDF 電子讀本。'}
              </p>
            )}
          </div>
        </div>

        <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
          最近一次備份：{lastBackupText}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            disabled={isQueueFull}
            onClick={() => setExportMenuOpen(true)}
            className="min-h-[46px] px-4 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {isQueueFull
                ? `佇列已滿 (${queuedTasks.length}/${MAX_EXPORT_QUEUE_SIZE})`
                : activeTask
                ? '匯出 / 加入隊列'
                : '匯出 & 備份'}
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={handlePickBackupFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[46px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>匯入</span>
          </button>
        </div>

        {/* Active Export Progress Bar & Waiting Queue inside Export Box */}
        {(activeTask || queuedTasks.length > 0) && (
          <div className="p-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/90 dark:border-stone-700 space-y-2.5">
            {activeTask && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-stone-800 dark:text-stone-100 truncate">
                    {activeTask.title}
                  </span>
                  <span className="tabular-nums font-semibold text-[#284152] dark:text-[#E7E5E0] shrink-0">
                    {activeTask.pct}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                  <div
                    className="h-full bg-[#284152] dark:bg-[#E7E5E0] transition-all duration-150"
                    style={{ width: `${activeTask.pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                  <span className="truncate">
                    {isCardExportingPriority
                      ? '圖卡優先輸出中，背景任務暫停等候接續...'
                      : activeTask.label}
                  </span>
                  <span className="shrink-0">背景執行中（可自由操作其他頁面）</span>
                </div>
              </div>
            )}

            {queuedTasks.length > 0 && (
              <div className="pt-2 border-t border-stone-200/80 dark:border-stone-700/80 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>等待隊列 ({queuedTasks.length}/{MAX_EXPORT_QUEUE_SIZE})</span>
                  </span>
                  <span>目前任務完成後自動開始</span>
                </div>
                <div className="space-y-1">
                  {queuedTasks.map((qt, idx) => {
                    const confirming = confirmCancelTaskId === qt.id;
                    return (
                      <div
                        key={qt.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-[#191918] text-xs text-stone-700 dark:text-stone-300"
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
                          <div className="flex items-center gap-1.5 shrink-0">
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
                            aria-label={`取消排隊任務 ${qt.title}`}
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
          </div>
        )}

        {pendingArchive && (
          <div className="p-4 rounded-xl bg-[#EFECE6] dark:bg-[#222220] border border-stone-200 dark:border-stone-700 space-y-3">
            <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
              已讀取備份檔（匯出時間：{new Date(pendingArchive.exportedAt).toLocaleString('zh-TW')} · 包含{' '}
              <span className="tabular-nums">{pendingArchive.works.length}</span> 件作品與{' '}
              <span className="tabular-nums">{pendingArchive.collections.length}</span> 個作品集）
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={importing}
                onClick={() => void confirmRestore('merge')}
                className="min-h-[40px] px-4 rounded-lg bg-[#284152] text-white text-xs font-medium"
              >
                合併匯入（保留現有作品）
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => void confirmRestore('replace')}
                className="min-h-[40px] px-4 rounded-lg bg-[#9E3B33] text-white text-xs font-medium"
              >
                完全覆蓋還原
              </button>
              <button
                type="button"
                onClick={() => setPendingArchive(null)}
                className="min-h-[40px] px-3 text-xs text-stone-500"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {backupFeedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2 ${
              backupFeedback.type === 'success'
                ? 'bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-stone-200'
                : backupFeedback.type === 'info'
                ? 'bg-[#EFECE6] dark:bg-[#222220] text-stone-700 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700'
                : 'bg-[#9E3B33]/10 text-[#9E3B33] dark:text-[#E07A70]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{backupFeedback.text}</span>
          </div>
        )}
      </section>

      {/* Privacy Lock Card */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={handleShieldTap}
              aria-label="隱私安全護盾"
              className="w-10 h-10 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-stone-700 dark:text-stone-300 shrink-0 active:scale-95 transition-transform"
            >
              <Shield className="w-5 h-5" />
            </button>
            <div>
              <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                隱私加密鎖定
              </h3>
              {!isConciseCopy && (
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                  設定 4 位數密碼後，標記為「私密」的攝影與手記將使用本機 AES-GCM 加密密封保存。
                </p>
              )}
              {devUnlockHint && !isMinimalMode && (
                <p className="text-[11px] text-[#284152] dark:text-stone-300 font-medium mt-1">
                  {devUnlockHint}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!settings.hasPin ? (
            <button
              type="button"
              onClick={onSetupPin}
              className="min-h-[44px] px-5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>設定 4 位數隱私密碼</span>
            </button>
          ) : (
            <>
              {isVaultUnlocked ? (
                <button
                  type="button"
                  onClick={onLockVault}
                  className="min-h-[44px] px-5 rounded-xl bg-[#284152] text-white text-xs font-medium inline-flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>立即加密鎖定私密作品</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onUnlockVault}
                  className="min-h-[44px] px-5 rounded-xl bg-[#9E3B33] text-white text-xs font-medium inline-flex items-center gap-2"
                >
                  <Unlock className="w-4 h-4" />
                  <span>解鎖私密典藏</span>
                </button>
              )}

              <button
                type="button"
                onClick={onSetupPin}
                className="min-h-[44px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300"
              >
                更換密碼
              </button>

              <button
                type="button"
                onClick={onDisablePin}
                className="min-h-[44px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-[#9E3B33] dark:text-[#E07A70]"
              >
                移除密碼鎖
              </button>
            </>
          )}
        </div>

        {settings.hasPin && (
          <label className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800 cursor-pointer min-h-[44px]">
            <span className="text-xs text-stone-700 dark:text-stone-300">
              開啟 App 時要求先解鎖私密區域（自動上鎖保護）
            </span>
            <input
              type="checkbox"
              checked={settings.requireLockOnLaunch}
              onChange={(e) =>
                void onUpdateSettings({ requireLockOnLaunch: e.target.checked })
              }
              className="w-4 h-4 accent-[#284152]"
            />
          </label>
        )}
      </section>

      {/* Group 3: Collapsible Appearance, Interface Modes & Creation Defaults */}
      <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('appearance')}
          aria-expanded={expandedSections.appearance}
          className="w-full px-5 py-4 sm:px-6 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-stone-700 dark:text-stone-300 shrink-0">
              <Feather className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                外觀與介面設定
              </h3>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                {[
                  settings.theme === 'dark' ? '暗房深色' : '素紙淺色',
                  (settings.defaultNewWorkType ?? 'photography') === 'writing'
                    ? '預設文字創作'
                    : '預設攝影作品',
                  isConciseCopy ? '簡易描述' : '',
                  isMinimalMode ? '極簡模式' : '',
                  isAnimationOverhaul ? '動畫重塑（測試中）' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
              expandedSections.appearance ? 'rotate-180' : ''
            }`}
          />
        </button>

        <SmoothCollapse
          open={expandedSections.appearance}
          animate={animationOverhaul}
          durationMs={260}
        >
              <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-6">
            {/* Subgroup 1: Interface Style & Display Modes */}
            <div className="space-y-3.5">
              <div className="text-[11px] font-semibold tracking-wide text-stone-400 dark:text-stone-500">
                介面與顯示模式
              </div>

              {/* Reading Theme */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    閱讀介面色調
                  </div>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    切換日間素紙或夜間暗房主題
                  </SmoothConciseNote>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ theme: 'light' })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                      settings.theme === 'light'
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {settings.theme === 'light' && (
                      <SlidingPill
                        layoutId="vault-theme-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <Sun className="w-3.5 h-3.5 relative z-10" />
                    <span className="relative z-10">素紙淺色</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ theme: 'dark' })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                      settings.theme === 'dark'
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {settings.theme === 'dark' && (
                      <SlidingPill
                        layoutId="vault-theme-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <Moon className="w-3.5 h-3.5 relative z-10" />
                    <span className="relative z-10">暗房深色</span>
                  </button>
                </div>
              </div>

              {/* Concise Copy Mode (簡易描述模式) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-stone-100 dark:border-stone-800/80">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    簡易描述模式
                  </div>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    精簡各頁面的輔助說明與提示文字，只保留關鍵資訊，讓介面更純淨俐落。
                  </SmoothConciseNote>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ conciseCopyMode: true })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      isConciseCopy
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {isConciseCopy && (
                      <SlidingPill
                        layoutId="vault-concise-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">開啟</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ conciseCopyMode: false })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      !isConciseCopy
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {!isConciseCopy && (
                      <SlidingPill
                        layoutId="vault-concise-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">關閉</span>
                  </button>
                </div>
              </div>

              {/* Minimal Mode */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-stone-100 dark:border-stone-800/80">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    極簡模式
                  </div>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    僅保留存入作品、閱讀、編輯、離線備份與私密加密，關閉作品集分類、地圖、圖卡與 PDF 等進階功能。
                  </SmoothConciseNote>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ minimalMode: true })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      isMinimalMode
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {isMinimalMode && (
                      <SlidingPill
                        layoutId="vault-minimal-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">開啟</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ minimalMode: false })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      !isMinimalMode
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {!isMinimalMode && (
                      <SlidingPill
                        layoutId="vault-minimal-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">關閉</span>
                  </button>
                </div>
              </div>

              {/* Experimental Animation Overhaul (動畫重塑（測試中）) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-stone-100 dark:border-stone-800/80">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-stone-800 dark:text-stone-200">
                      動畫重塑
                    </span>
                    <span className="text-[11px] font-medium text-[#284152] dark:text-[#A3BFD1]">
                      （測試中）
                    </span>
                  </div>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    強化分頁切換、作品卡片、彈出視窗與設定面板展開的流暢過渡幅度，兼具質感與柔和阻尼感。
                  </SmoothConciseNote>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ animationOverhaul: true })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      isAnimationOverhaul
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {isAnimationOverhaul && (
                      <SlidingPill
                        layoutId="vault-motion-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">開啟</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ animationOverhaul: false })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      !isAnimationOverhaul
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {!isAnimationOverhaul && (
                      <SlidingPill
                        layoutId="vault-motion-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">關閉</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Subgroup 2: Navigation & Button Layout */}
            <div className="pt-4 border-t border-stone-200/70 dark:border-stone-800 space-y-3.5">
              <div className="text-[11px] font-semibold tracking-wide text-stone-400 dark:text-stone-500">
                導覽與按鈕配置
              </div>

              {/* Swipe Navigation Between Main Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    頁面左右滑動切換分頁
                  </div>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    開啟後，在頁面非互動空白區域左右滑動即可依序切換{isMinimalMode ? '「典藏 / 備份」' : '「典藏 / 整理 / 圖卡 / 備份」'}。
                  </SmoothConciseNote>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ swipeTabNavigationEnabled: true })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      settings.swipeTabNavigationEnabled !== false
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {settings.swipeTabNavigationEnabled !== false && (
                      <SlidingPill
                        layoutId="vault-swipe-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">開啟</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ swipeTabNavigationEnabled: false })}
                    className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                      settings.swipeTabNavigationEnabled === false
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {settings.swipeTabNavigationEnabled === false && (
                      <SlidingPill
                        layoutId="vault-swipe-pill"
                        className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">關閉</span>
                  </button>
                </div>
              </div>

              {/* Mobile Add Button Position */}
              <div className="pt-3.5 border-t border-stone-100 dark:border-stone-800/80 space-y-2.5">
                <div>
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    新增作品（＋）按鈕位置（手機版）
                  </div>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    可將「＋」配置於底部導覽欄左、中、右，或維持在介面左／右下方懸浮。
                  </SmoothConciseNote>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80">
                  {(
                    [
                      { id: 'nav-left', label: '底部欄左側' },
                      { id: 'nav-center', label: '底部欄中央' },
                      { id: 'nav-right', label: '底部欄右側' },
                      { id: 'fab-left', label: '介面左下方' },
                      { id: 'fab-right', label: '介面右下方' },
                    ] as { id: AddButtonPosition; label: string }[]
                  ).map((opt) => {
                    const currentPos = settings.addButtonPosition || 'fab-right';
                    const active = currentPos === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => void onUpdateSettings({ addButtonPosition: opt.id })}
                        className={`relative min-h-[36px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                          active
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                        }`}
                      >
                        {active && (
                          <SlidingPill
                            layoutId="vault-addpos-pill"
                            className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                          />
                        )}
                        <span className="relative z-10">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Subgroup 3: Creation & Editor Defaults */}
            <div className="pt-4 border-t border-stone-200/70 dark:border-stone-800 space-y-3.5">
              <div className="text-[11px] font-semibold tracking-wide text-stone-400 dark:text-stone-500">
                收錄與編輯預設
              </div>

              {/* Default New Work Type */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                    收錄新作品頁面預設類型
                  </div>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    點擊「＋」建立新作品時，預設開啟攝影作品或文字創作模式。
                  </SmoothConciseNote>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 shrink-0">
                  {(
                    [
                      { id: 'photography', label: '攝影作品', Icon: Camera },
                      { id: 'writing', label: '文字創作', Icon: Feather },
                    ] as { id: WorkType; label: string; Icon: React.FC<{ className?: string }> }[]
                  ).map(({ id, label, Icon }) => {
                    const active = (settings.defaultNewWorkType ?? 'photography') === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void onUpdateSettings({ defaultNewWorkType: id })}
                        className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                          active
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                        }`}
                      >
                        {active && (
                          <SlidingPill
                            layoutId="vault-newtype-pill"
                            className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                          />
                        )}
                        <Icon className="w-3.5 h-3.5 relative z-10" />
                        <span className="relative z-10">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Default Untitled Title */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-stone-100 dark:border-stone-800/80">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="vault-default-untitled-title"
                    className="block text-xs font-medium text-stone-800 dark:text-stone-200"
                  >
                    未命名作品預設標題
                  </label>
                  <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                    收錄或編輯作品時若未填寫標題，將自動填入此名稱（留空則為「無題」）。
                  </SmoothConciseNote>
                </div>
                <div className="w-full sm:w-56 shrink-0">
                  <input
                    id="vault-default-untitled-title"
                    type="text"
                    maxLength={32}
                    value={settings.defaultUntitledTitle ?? '無題'}
                    onChange={(e) => void onUpdateSettings({ defaultUntitledTitle: e.target.value })}
                    placeholder="無題"
                    aria-label="未命名作品預設標題"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#284152]/20"
                  />
                </div>
              </div>

              {/* Default Collection & Default Markdown (hidden in Minimal Mode) */}
              <SmoothCollapse
                open={!isMinimalMode}
                animate={animationOverhaul}
                durationMs={220}
                innerClassName="space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-stone-100 dark:border-stone-800/80">
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="vault-default-collection"
                      className="block text-xs font-medium text-stone-800 dark:text-stone-200"
                    >
                      新增作品時的預設作品集
                    </label>
                    <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                      建立新作品時自動歸入指定的作品集分類。
                    </SmoothConciseNote>
                  </div>
                  <div className="relative w-full sm:w-56 shrink-0">
                    <select
                      id="vault-default-collection"
                      value={settings.defaultCollectionId || ''}
                      onChange={(e) => void onUpdateSettings({ defaultCollectionId: e.target.value })}
                      aria-label="新增作品時的預設作品集"
                      className="w-full min-h-[44px] pl-3.5 pr-9 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 text-xs font-medium text-stone-900 dark:text-stone-100 appearance-none focus:outline-none focus:ring-2 focus:ring-[#284152]/20"
                    >
                      <option value="">不加入任何作品集（預設）</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-stone-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-stone-100 dark:border-stone-800/80">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                      偵測到 Markdown 語法時預設狀態
                    </div>
                    <SmoothConciseNote show={!isConciseCopy} animate={animationOverhaul}>
                      編輯作品內文若偵測到粗體、斜體或刪除線等語法，預設自動開啟或保持關閉。
                    </SmoothConciseNote>
                  </div>
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/70 dark:border-stone-800/80 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onUpdateSettings({ defaultMarkdownEnabled: true })}
                      className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                        defaultMarkdownEnabled
                          ? 'text-stone-900 dark:text-stone-100'
                          : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      {defaultMarkdownEnabled && (
                        <SlidingPill
                          layoutId="vault-md-pill"
                          className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                        />
                      )}
                      <span className="relative z-10">預設開啟</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdateSettings({ defaultMarkdownEnabled: false })}
                      className={`relative min-h-[36px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors ${
                        !defaultMarkdownEnabled
                          ? 'text-stone-900 dark:text-stone-100'
                          : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      {!defaultMarkdownEnabled && (
                        <SlidingPill
                          layoutId="vault-md-pill"
                          className="bg-white dark:bg-[#111110] shadow-sm rounded-lg"
                        />
                      )}
                      <span className="relative z-10">預設關閉</span>
                    </button>
                  </div>
                </div>
              </SmoothCollapse>
            </div>
              </div>
        </SmoothCollapse>
      </section>

      {/* Group 4: Collapsible Less-Frequently-Changed Settings (hidden in Minimal Mode) */}
      <SmoothCollapse
        open={!isMinimalMode}
        animate={animationOverhaul}
        durationMs={240}
        innerClassName="space-y-3"
      >
        <div className="px-1 text-xs font-medium text-stone-500 dark:text-stone-400">
          進階設定與資料管理（點擊展開）
        </div>

        {/* Collapsible 1: Brand Title, Author Name & Seal */}
        <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('identity')}
            aria-expanded={expandedSections.identity}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
          >
            <div className="min-w-0">
              <div className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                個人落款與標題文字
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                標題「{settings.brandTitle?.trim() || '拾光卷宗'}」 · 署名「{settings.authorName || '未設定'}」 · 印章「{settings.sealText || '印'}」
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                expandedSections.identity ? 'rotate-180' : ''
              }`}
            />
          </button>

          <SmoothCollapse
            open={expandedSections.identity}
            animate={animationOverhaul}
            durationMs={250}
          >
                <div className="px-5 pb-5 pt-3 border-t border-stone-100 dark:border-stone-800 space-y-4">
              <div>
                <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1.5">
                  左上角頁面標題（預設「拾光卷宗」，留空將顯示預設名稱）
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={settings.brandTitle ?? '拾光卷宗'}
                  onChange={(e) => void onUpdateSettings({ brandTitle: e.target.value })}
                  placeholder="拾光卷宗"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1.5">
                    預設作者署名（用於分享圖卡與電子讀本）
                  </label>
                  <input
                    type="text"
                    value={settings.authorName}
                    onChange={(e) => void onUpdateSettings({ authorName: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100"
                  />
                </div>

                <div>
                  <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1.5">
                    印章單字
                  </label>
                  <input
                    type="text"
                    maxLength={1}
                    value={settings.sealText}
                    onChange={(e) => void onUpdateSettings({ sealText: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-center text-stone-900 dark:text-stone-100"
                  />
                </div>
              </div>
            </div>
          </SmoothCollapse>
        </section>

        {/* Collapsible 2: Tag Management */}
        <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('tags')}
            aria-expanded={expandedSections.tags}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-stone-700 dark:text-stone-300 shrink-0">
                <Tag className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  標籤管理
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
                  通用預設 {presetTags.length} 個 · 常用自訂 {customTags.length} 個
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                expandedSections.tags ? 'rotate-180' : ''
              }`}
            />
          </button>

          <SmoothCollapse
            open={expandedSections.tags}
            animate={animationOverhaul}
            durationMs={250}
          >
                <div className="px-5 pb-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-5">
              {/* Preset Tags Management */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-stone-700 dark:text-stone-300">
                    通用預設標籤（{presetTags.length}）
                  </span>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ presetTags: DEFAULT_PRESET_TAGS })}
                    className="text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 inline-flex items-center gap-1 py-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>恢復初始預設</span>
                  </button>
                </div>

                <form onSubmit={handleAddPresetTag} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPresetInput}
                    onChange={(e) => setNewPresetInput(e.target.value)}
                    placeholder="新增通用預設標籤..."
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增</span>
                  </button>
                </form>

                {presetTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {presetTags.map((tag) => {
                      const isEditing =
                        editingTag?.group === 'preset' && editingTag.oldValue === tag;
                      if (isEditing) {
                        return (
                          <div
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F7F6F2] dark:bg-[#252523] border border-[#284152] dark:border-stone-500"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingTag.draft}
                              onChange={(e) =>
                                setEditingTag({ ...editingTag, draft: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveTagRename();
                                } else if (e.key === 'Escape') {
                                  setEditingTag(null);
                                }
                              }}
                              className="w-24 bg-transparent text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveTagRename()}
                              aria-label="儲存標籤名稱"
                              className="p-1 text-[#284152] dark:text-stone-200"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTag(null)}
                              aria-label="取消修改"
                              className="p-1 text-stone-400"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      }

                      const isConfirmingDelete =
                        pendingDeleteTag?.group === 'preset' && pendingDeleteTag.tag === tag;

                      if (isConfirmingDelete) {
                        return (
                          <div
                            key={tag}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#9E3B33]/10 border border-[#9E3B33]/40 text-xs"
                          >
                            <span className="text-[#9E3B33] dark:text-[#E07A70] font-medium">
                              移除 #{tag}？
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeletePresetTag(tag);
                                setPendingDeleteTag(null);
                              }}
                              className="px-2 py-0.5 rounded bg-[#9E3B33] text-white text-[11px] font-medium"
                            >
                              確認
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteTag(null)}
                              className="px-1 py-0.5 text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                            >
                              取消
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={tag}
                          className="inline-flex items-center rounded-lg bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 overflow-hidden"
                        >
                          <span className="pl-2.5 pr-1.5 py-1.5 text-xs text-stone-700 dark:text-stone-300">
                            #{tag}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingDeleteTag(null);
                              setEditingTag({ group: 'preset', oldValue: tag, draft: tag });
                            }}
                            aria-label={`修改標籤 ${tag}`}
                            title="修改名稱"
                            className="p-1.5 text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteTag({ group: 'preset', tag })}
                            aria-label={`刪除標籤 ${tag}`}
                            title="刪除"
                            className="pr-2 pl-1 py-1.5 text-stone-400 hover:text-[#9E3B33]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">
                    目前無通用預設標籤，可於上方新增或點擊「恢復初始預設」。
                  </p>
                )}
              </div>

              {/* Custom Frequent Tags Management */}
              <div className="space-y-3 pt-4 border-t border-stone-100 dark:border-stone-800">
                <span className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                  常用自訂標籤（{customTags.length}）
                </span>

                <form onSubmit={handleAddCustomTag} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCustomInput}
                    onChange={(e) => setNewCustomInput(e.target.value)}
                    placeholder="新增常用自訂標籤..."
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="min-h-[40px] px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1 shrink-0 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增</span>
                  </button>
                </form>

                {customTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {customTags.map((tag) => {
                      const isEditing =
                        editingTag?.group === 'custom' && editingTag.oldValue === tag;
                      if (isEditing) {
                        return (
                          <div
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F7F6F2] dark:bg-[#252523] border border-[#284152] dark:border-stone-500"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingTag.draft}
                              onChange={(e) =>
                                setEditingTag({ ...editingTag, draft: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveTagRename();
                                } else if (e.key === 'Escape') {
                                  setEditingTag(null);
                                }
                              }}
                              className="w-24 bg-transparent text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveTagRename()}
                              aria-label="儲存標籤名稱"
                              className="p-1 text-[#284152] dark:text-stone-200"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTag(null)}
                              aria-label="取消修改"
                              className="p-1 text-stone-400"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      }

                      const isConfirmingDelete =
                        pendingDeleteTag?.group === 'custom' && pendingDeleteTag.tag === tag;

                      if (isConfirmingDelete) {
                        return (
                          <div
                            key={tag}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#9E3B33]/10 border border-[#9E3B33]/40 text-xs"
                          >
                            <span className="text-[#9E3B33] dark:text-[#E07A70] font-medium">
                              移除 #{tag}？
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteCustomTag(tag);
                                setPendingDeleteTag(null);
                              }}
                              className="px-2 py-0.5 rounded bg-[#9E3B33] text-white text-[11px] font-medium"
                            >
                              確認
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteTag(null)}
                              className="px-1 py-0.5 text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                            >
                              取消
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={tag}
                          className="inline-flex items-center rounded-lg bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 overflow-hidden"
                        >
                          <span className="pl-2.5 pr-1.5 py-1.5 text-xs text-stone-700 dark:text-stone-300">
                            #{tag}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingDeleteTag(null);
                              setEditingTag({ group: 'custom', oldValue: tag, draft: tag });
                            }}
                            aria-label={`修改標籤 ${tag}`}
                            title="修改名稱"
                            className="p-1.5 text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteTag({ group: 'custom', tag })}
                            aria-label={`刪除標籤 ${tag}`}
                            title="刪除"
                            className="pr-2 pl-1 py-1.5 text-stone-400 hover:text-[#9E3B33]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">尚未儲存常用自訂標籤。</p>
                )}
              </div>
            </div>
          </SmoothCollapse>
        </section>

        {/* Collapsible 3: Onboarding & Sample Works Management */}
        <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('onboarding')}
            aria-expanded={expandedSections.onboarding}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-stone-700 dark:text-stone-300 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  初始指引與範例資料
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
                  {remainingSeedCount > 0
                    ? `尚有 ${remainingSeedCount} 件內建範例作品`
                    : '已清除全部內建範例作品'}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                expandedSections.onboarding ? 'rotate-180' : ''
              }`}
            />
          </button>

          <SmoothCollapse
            open={expandedSections.onboarding}
            animate={animationOverhaul}
            durationMs={250}
          >
                <div className="px-5 pb-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-3">
              {!isConciseCopy && (
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  可隨時重看歡迎介紹指引，或清除 App 預載的範例攝影與文字作品（不會影響您自行建立的作品）。
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onOpenWelcome}
                  className="min-h-[42px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 inline-flex items-center gap-1.5 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>重看初始指引</span>
                </button>

                {remainingSeedCount > 0 ? (
                  confirmClearSeed ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={clearingSeed}
                        onClick={async () => {
                          setClearingSeed(true);
                          try {
                            await onClearSeedWorks();
                            setConfirmClearSeed(false);
                            setBackupFeedback({
                              type: 'success',
                              text: '已清除所有系統預載的範例作品與未使用範例作品集。',
                            });
                          } finally {
                            setClearingSeed(false);
                          }
                        }}
                        className="min-h-[42px] px-4 rounded-xl bg-[#9E3B33] text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {clearingSeed
                            ? '清除中...'
                            : `確認清除 ${remainingSeedCount} 件範例作品`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearSeed(false)}
                        className="min-h-[40px] px-3 text-xs text-stone-500"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearSeed(true)}
                      className="min-h-[42px] px-4 rounded-xl border border-[#9E3B33]/35 text-[#9E3B33] dark:text-[#E07A70] text-xs font-medium hover:bg-[#9E3B33]/5 inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>清除預設範例作品（{remainingSeedCount}）</span>
                    </button>
                  )
                ) : (
                  <span className="text-xs text-stone-400 inline-flex items-center gap-1.5 px-2">
                    <Check className="w-3.5 h-3.5" />
                    <span>已清除全部內建範例作品</span>
                  </span>
                )}
              </div>
            </div>
          </SmoothCollapse>
        </section>

        {/* Optional In-App PWA Install Card (hidden in standalone / Capacitor native APK) */}
        {!isInstalled && (isInstallable || isIOS) && (
          <section className="rounded-2xl bg-[#EFECE6]/70 dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  安裝為離線桌面應用程式
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  將拾光卷宗加入主畫面，離線時也能直接快速開啟。
                </p>
              </div>
            </div>
            {isInstallable ? (
              <button
                type="button"
                onClick={() => void install()}
                className="min-h-[40px] px-4 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium shrink-0 hover:opacity-90 transition-opacity"
              >
                安裝應用
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowIOSInstallGuide(true)}
                className="min-h-[40px] px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 shrink-0"
              >
                iOS 安裝教學
              </button>
            )}
          </section>
        )}
      </SmoothCollapse>

      {/* Collapsible Developer Options (Persisted open once unlocked; 5 rapid taps on Privacy Shield icon hides it) */}
      {!isMinimalMode && devOptionsOpen && (
        <section className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('developer')}
            aria-expanded={expandedSections.developer}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#222220] flex items-center justify-center text-[#284152] dark:text-[#E7E5E0] shrink-0">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  開發者選項
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 truncate tabular-nums">
                  效能儀表板 · 背景模擬測試（再次於護盾連點 5 下可隱藏）
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                expandedSections.developer ? 'rotate-180' : ''
              }`}
            />
          </button>

          <SmoothCollapse
            open={expandedSections.developer}
            animate={animationOverhaul}
            durationMs={250}
          >
                <div className="px-5 pb-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-4">
              <DeveloperPerfDashboard
                isExporting={Boolean(activeTask)}
                onPrewarmCache={() => exportCache.prewarmWorks(works, collections)}
              />

              <div className="p-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                    背景佇列與模擬測試
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                    執行中：{activeTask ? `1 件（${activeTask.pct}%）` : '0 件'} · 等待中：{queuedTasks.length} / {MAX_EXPORT_QUEUE_SIZE}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isQueueFull}
                  onClick={handleCreateSimulatedExportTask}
                  className="min-h-[44px] px-4 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-45 whitespace-nowrap shrink-0"
                >
                  <FlaskConical className="w-4 h-4 shrink-0" />
                  <span>創建一個無真實匯出的 10 秒匯出任務</span>
                </button>
              </div>
                </div>
          </SmoothCollapse>
        </section>
      )}

      {showIOSInstallGuide && (
        <div
          data-no-swipe="true"
          className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4 overscroll-contain touch-none"
          onClick={() => setShowIOSInstallGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#F7F6F2] dark:bg-[#191918] border border-stone-200 dark:border-stone-800 p-5 space-y-3 shadow-2xl overscroll-contain touch-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
              加入 iPhone / iPad 主畫面
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
              1. 點擊 Safari 工具列的「分享」按鈕。
              <br />
              2. 向下滑動並選擇「加入主畫面」，即可離線獨立開啟。
            </p>
            <button
              type="button"
              onClick={() => setShowIOSInstallGuide(false)}
              className="w-full min-h-[40px] rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* Export & Backup Option Chooser Modal */}
      <BottomSheet
        isOpen={exportMenuOpen}
        onClose={() => setExportMenuOpen(false)}
        backdropToneClass="bg-black/45"
        maxWidthClass="sm:max-w-md"
        handleInsidePaddedPanel
        panelClassName="bg-[#F7F6F2] dark:bg-[#171716] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl p-5 pb-safe space-y-4 shadow-2xl"
      >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                    選擇匯出與備份格式
                  </h3>
                  {!isConciseCopy && (
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                      依照需求選擇跨平台壓縮包、資料備份檔或電子讀本。
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExportMenuOpen(false)}
                  aria-label="關閉選單"
                  className="min-h-[40px] min-w-[40px] -mr-1 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleExportZip}
                  className="w-full p-4 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/90 dark:border-stone-800 hover:border-[#284152] dark:hover:border-stone-600 text-left flex items-start gap-3.5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 flex items-center justify-center shrink-0">
                    <FolderArchive className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      匯出跨平台整理包 (.zip)
                    </div>
                    {!isConciseCopy && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                        含分類資料夾、真實 JPG/PNG 照片、Markdown 文字檔、離線 HTML 目錄及完整還原清單。
                      </p>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="w-full p-4 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/90 dark:border-stone-800 hover:border-[#284152] dark:hover:border-stone-600 text-left flex items-start gap-3.5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EFECE6] dark:bg-[#252523] text-stone-700 dark:text-stone-200 flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      匯出標準備份檔 (.json)
                    </div>
                    {!isConciseCopy && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                        單一純離線備份檔，完整保存所有作品、標籤與加密內容，體積輕巧方便留存。
                      </p>
                    )}
                  </div>
                </button>

                {!isMinimalMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      onOpenPdfExporter();
                    }}
                    className="w-full p-4 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200/90 dark:border-stone-800 hover:border-[#284152] dark:hover:border-stone-600 text-left flex items-start gap-3.5 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#EFECE6] dark:bg-[#252523] text-stone-700 dark:text-stone-200 flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                        製成 PDF 電子讀本 (.pdf)
                      </div>
                      {!isConciseCopy && (
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                          挑選作品集或單篇作品，排版為附封面、目錄與頁碼的離線電子書供平板／閱讀器翻閱。
                        </p>
                      )}
                    </div>
                  </button>
                )}
              </div>
      </BottomSheet>
    </div>
  );
};
