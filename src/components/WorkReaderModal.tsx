import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FileDown,
  FileText,
  Heart,
  List,
  Lock,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Trash2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useExportQueue } from '../contexts/ExportQueueContext';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { hasMarkdownSyntax } from '../services/markdown';
import { exportWorksAsPdfEbook } from '../services/pdfEbook';
import { Collection, WorkItem } from '../types';

const READER_COMFORT_KEY = 'folio_reader_comfort_v1';
const READER_PROGRESS_KEY = 'folio_reader_progress_v1';
const MAX_SAVED_PROGRESS_ENTRIES = 80;
const MAX_FULL_COPY_CHARS = 8000;

export type ReaderMode = 'scroll' | 'paged';
type ComfortPresetId = 'comfort' | 'compact' | 'focus';

interface SavedReadingProgress {
  workId: string;
  scrollTop: number;
  maxScroll: number;
  scrollRatio: number;
  percent: number;
  chapterIdx: number | null;
  chapterTitle?: string;
  pageIndex: number;
  readingMode: ReaderMode;
  updatedAt: number;
}

interface ReaderComfortConfig {
  fontSizePx: 15 | 17 | 19 | 21;
  lineHeight: 1.65 | 1.85 | 1.95 | 2.15;
  maxWidthCh: 54 | 65 | 76;
  comfortableSpacing: boolean;
  readingMode: ReaderMode;
}

const DEFAULT_COMFORT_CONFIG: ReaderComfortConfig = {
  fontSizePx: 17,
  lineHeight: 1.95,
  maxWidthCh: 65,
  comfortableSpacing: true,
  readingMode: 'scroll',
};

const COMFORT_PRESETS: {
  id: ComfortPresetId;
  label: string;
  config: ReaderComfortConfig;
}[] = [
  {
    id: 'comfort',
    label: '舒適閱讀',
    config: { fontSizePx: 17, lineHeight: 1.95, maxWidthCh: 65, comfortableSpacing: true, readingMode: 'scroll' },
  },
  {
    id: 'compact',
    label: '緊湊閱讀',
    config: { fontSizePx: 15, lineHeight: 1.65, maxWidthCh: 76, comfortableSpacing: false, readingMode: 'scroll' },
  },
  {
    id: 'focus',
    label: '專注大字',
    config: { fontSizePx: 21, lineHeight: 2.15, maxWidthCh: 54, comfortableSpacing: true, readingMode: 'scroll' },
  },
];

function loadReaderComfort(): ReaderComfortConfig {
  try {
    const raw = localStorage.getItem(READER_COMFORT_KEY);
    if (!raw) return DEFAULT_COMFORT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ReaderComfortConfig>;
    return {
      fontSizePx:
        parsed.fontSizePx === 15 ||
        parsed.fontSizePx === 17 ||
        parsed.fontSizePx === 19 ||
        parsed.fontSizePx === 21
          ? parsed.fontSizePx
          : DEFAULT_COMFORT_CONFIG.fontSizePx,
      lineHeight:
        parsed.lineHeight === 1.65 ||
        parsed.lineHeight === 1.85 ||
        parsed.lineHeight === 1.95 ||
        parsed.lineHeight === 2.15
          ? parsed.lineHeight
          : DEFAULT_COMFORT_CONFIG.lineHeight,
      maxWidthCh:
        parsed.maxWidthCh === 54 || parsed.maxWidthCh === 65 || parsed.maxWidthCh === 76
          ? parsed.maxWidthCh
          : DEFAULT_COMFORT_CONFIG.maxWidthCh,
      comfortableSpacing:
        typeof parsed.comfortableSpacing === 'boolean'
          ? parsed.comfortableSpacing
          : DEFAULT_COMFORT_CONFIG.comfortableSpacing,
      readingMode: parsed.readingMode === 'paged' ? 'paged' : 'scroll',
    };
  } catch {
    return DEFAULT_COMFORT_CONFIG;
  }
}

function loadReadingProgressMap(): Record<string, SavedReadingProgress> {
  try {
    const raw = localStorage.getItem(READER_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<SavedReadingProgress>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: Record<string, SavedReadingProgress> = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.scrollTop !== 'number' || !Number.isFinite(entry.scrollTop)) continue;
      clean[id] = {
        workId: id,
        scrollTop: Math.max(0, entry.scrollTop),
        maxScroll:
          typeof entry.maxScroll === 'number' && Number.isFinite(entry.maxScroll)
            ? Math.max(0, entry.maxScroll)
            : 0,
        scrollRatio:
          typeof entry.scrollRatio === 'number' && Number.isFinite(entry.scrollRatio)
            ? Math.min(1, Math.max(0, entry.scrollRatio))
            : 0,
        percent:
          typeof entry.percent === 'number' && Number.isFinite(entry.percent)
            ? Math.min(100, Math.max(0, Math.round(entry.percent)))
            : 0,
        chapterIdx:
          typeof entry.chapterIdx === 'number' && Number.isInteger(entry.chapterIdx) && entry.chapterIdx >= 0
            ? entry.chapterIdx
            : null,
        chapterTitle: typeof entry.chapterTitle === 'string' ? entry.chapterTitle : undefined,
        pageIndex:
          typeof entry.pageIndex === 'number' && Number.isInteger(entry.pageIndex) && entry.pageIndex >= 0
            ? entry.pageIndex
            : 0,
        readingMode: entry.readingMode === 'paged' ? 'paged' : 'scroll',
        updatedAt:
          typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
            ? entry.updatedAt
            : 0,
      };
    }
    return clean;
  } catch {
    return {};
  }
}

function writeReadingProgressMap(map: Record<string, SavedReadingProgress>): void {
  try {
    const entries = Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
    const trimmed: Record<string, SavedReadingProgress> = {};
    for (const item of entries.slice(0, MAX_SAVED_PROGRESS_ENTRIES)) {
      trimmed[item.workId] = item;
    }
    localStorage.setItem(READER_PROGRESS_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore localStorage quota or private mode errors
  }
}

function saveReadingProgressEntry(entry: SavedReadingProgress): void {
  const map = loadReadingProgressMap();
  map[entry.workId] = entry;
  writeReadingProgressMap(map);
}

function removeReadingProgressEntry(workId: string): void {
  const map = loadReadingProgressMap();
  if (!(workId in map)) return;
  delete map[workId];
  writeReadingProgressMap(map);
}

export function removeReadingProgressEntries(workIds: string[]): void {
  if (workIds.length === 0) return;
  const map = loadReadingProgressMap();
  let changed = false;
  for (const id of workIds) {
    if (id in map) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) {
    writeReadingProgressMap(map);
  }
}

export function clearAllReadingProgress(): void {
  try {
    localStorage.removeItem(READER_PROGRESS_KEY);
  } catch {
    // Ignore storage access errors
  }
}

function hasMeaningfulProgress(entry: SavedReadingProgress | undefined | null): boolean {
  if (!entry) return false;
  return entry.scrollTop >= 48 || entry.pageIndex > 0 || entry.chapterIdx !== null;
}

/** 依段落邊界智慧切分長篇文字為合宜閱讀分頁（防止超長單一 DOM 節點卡頓） */
export function splitContentIntoPages(text: string, targetChars = 1100): string[] {
  if (!text) return [''];
  const trimmed = text.trim();
  if (trimmed.length <= targetChars * 1.25) return [trimmed];

  const rawParagraphs = trimmed.split(/\n\n+/);
  const pages: string[] = [];
  let currentGroup: string[] = [];
  let currentChars = 0;

  for (const p of rawParagraphs) {
    const pTrim = p.trim();
    if (!pTrim) continue;
    const pCleanLen = pTrim.replace(/\s+/g, '').length;

    if (currentChars > 0 && currentChars + pCleanLen > targetChars) {
      pages.push(currentGroup.join('\n\n'));
      currentGroup = [pTrim];
      currentChars = pCleanLen;
    } else {
      currentGroup.push(pTrim);
      currentChars += pCleanLen;
    }
  }

  if (currentGroup.length > 0) {
    pages.push(currentGroup.join('\n\n'));
  }

  return pages.length > 0 ? pages : [trimmed];
}

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

const ReaderMarkdownBody = React.memo<{
  content: string;
  enabled: boolean;
}>(({ content, enabled }) => {
  if (!enabled) {
    return <div className="whitespace-pre-line">{content}</div>;
  }
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={READER_MARKDOWN_COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  );
});
ReaderMarkdownBody.displayName = 'ReaderMarkdownBody';

const ChunkedReaderBody = React.memo<{
  content: string;
  enabled: boolean;
}>(({ content, enabled }) => {
  const paragraphs = useMemo(() => {
    return content.split(/\n\n+/).filter((p) => p.trim() !== '');
  }, [content]);

  // 短篇或中篇（小於 6 段）直接單一渲染，無額外包裝
  if (paragraphs.length <= 6) {
    return <ReaderMarkdownBody content={content} enabled={enabled} />;
  }

  // 長篇每 5 段分塊，藉由 content-visibility: auto 卸載視窗外 DOM 節點渲染負荷
  const chunks: string[] = [];
  for (let i = 0; i < paragraphs.length; i += 5) {
    chunks.push(paragraphs.slice(i, i + 5).join('\n\n'));
  }

  return (
    <div className="space-y-4">
      {chunks.map((chunk, idx) => (
        <div
          key={idx}
          style={{ contentVisibility: 'auto', containIntrinsicSize: '0 320px' }}
          className="reader-chunk"
        >
          <ReaderMarkdownBody content={chunk} enabled={enabled} />
        </div>
      ))}
    </div>
  );
});
ChunkedReaderBody.displayName = 'ChunkedReaderBody';

const READER_MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="font-editorial text-2xl sm:text-[26px] font-bold text-stone-950 dark:text-white leading-snug pt-3 pb-1 mt-4 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-editorial text-xl sm:text-[22px] font-bold text-stone-950 dark:text-white leading-snug pt-2.5 pb-0.5 mt-3 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-editorial text-lg sm:text-[19px] font-bold text-stone-950 dark:text-white leading-snug pt-2 mt-2.5 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-editorial text-base sm:text-lg font-bold text-stone-950 dark:text-white leading-snug pt-1.5 mt-2 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="leading-[inherit] my-3 first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-stone-950 dark:text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-stone-700 dark:text-stone-300">{children}</em>
  ),
  del: ({ children }) => (
    <del className="line-through opacity-70 decoration-[1.5px]">{children}</del>
  ),
  blockquote: ({ children }) => (
    <blockquote className="pl-4 py-1.5 my-4 border-l-2 border-[#9E3B33]/65 dark:border-[#C96458]/70 text-stone-600 dark:text-stone-300 italic">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-6 my-3 space-y-1.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 my-3 space-y-1.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[inherit]">{children}</li>,
  hr: () => (
    <hr className="my-6 border-0 border-t border-stone-300/80 dark:border-stone-700/80 w-24" />
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className && className.includes('language-'));
    if (isBlock) {
      return (
        <code className="block text-[0.88em] font-mono leading-relaxed text-stone-800 dark:text-stone-200">
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 mx-0.5 rounded bg-stone-200/80 dark:bg-stone-800 text-[#284152] dark:text-[#E7E5E0] text-[0.9em] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 p-3.5 rounded-xl bg-stone-200/60 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 overflow-x-auto">
      {children}
    </pre>
  ),
  a: ({ children }) => (
    <span className="underline decoration-stone-400 dark:decoration-stone-500 underline-offset-4 text-[#284152] dark:text-[#E7E5E0]">
      {children}
    </span>
  ),
  img: ({ src, alt }) => {
    const safeLocal =
      typeof src === 'string' &&
      (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('./'));
    if (!safeLocal) {
      return <span className="text-stone-500 text-sm">{alt || '[圖片]'}</span>;
    }
    return (
      <img
        src={src}
        alt={alt || ''}
        className="my-4 max-w-full rounded-xl border border-stone-200/70 dark:border-stone-800"
      />
    );
  },
};

interface WorkReaderModalProps {
  work: WorkItem | null;
  collections: Collection[];
  authorName?: string;
  sealText?: string;
  defaultMarkdownEnabled?: boolean;
  conciseCopyMode?: boolean;
  minimalMode?: boolean;
  onClose: () => void;
  onEdit: (work: WorkItem) => void;
  onDelete: (work: WorkItem) => void;
  onToggleFavorite: (work: WorkItem) => void;
  onTogglePrivate: (work: WorkItem) => void;
  onToggleMarkdown?: (work: WorkItem) => void;
  onOpenShareStudio: (work: WorkItem) => void;
}

export const WorkReaderModal: React.FC<WorkReaderModalProps> = ({
  work,
  collections,
  authorName = '林硯',
  sealText = '硯',
  defaultMarkdownEnabled = true,
  conciseCopyMode = false,
  minimalMode = false,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTogglePrivate,
  onToggleMarkdown,
  onOpenShareStudio,
}) => {
  useBodyScrollLock(Boolean(work));
  const { animationOverhaul } = useMotionPreferences();
  const { enqueueTask } = useExportQueue();
  const [comfortConfig, setComfortConfig] = useState<ReaderComfortConfig>(loadReaderComfort);
  const [comfortMenuOpen, setComfortMenuOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);
  const [activeChapterIdx, setActiveChapterIdx] = useState<number | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);
  const [chapterDirection, setChapterDirection] = useState<1 | -1>(1);
  const [selectedText, setSelectedText] = useState('');
  const [copyToast, setCopyToast] = useState<{ text: string; isCopied: boolean } | null>(null);
  const [fullCopied, setFullCopied] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<SavedReadingProgress | null>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const lastPctRef = useRef<number>(0);
  const proseRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const fullCopyTimerRef = useRef<number | null>(null);
  const hasUserInteractedRef = useRef<boolean>(false);
  const liveProgressRef = useRef<SavedReadingProgress | null>(null);
  const pendingScrollRestoreRef = useRef<SavedReadingProgress | null>(null);
  const resumeTimerRef = useRef<number | null>(null);

  const proseComfortStyle = useMemo(
    () =>
      ({
        '--reader-font-size': `${comfortConfig.fontSizePx}px`,
        '--reader-line-height': String(comfortConfig.lineHeight),
        '--reader-max-width': `${comfortConfig.maxWidthCh}ch`,
      }) as React.CSSProperties,
    [comfortConfig]
  );

  useEffect(() => {
    try {
      localStorage.setItem(READER_COMFORT_KEY, JSON.stringify(comfortConfig));
    } catch {
      // Ignore storage quota errors
    }
  }, [comfortConfig]);

  const readingContextRef = useRef<{
    workId: string | null;
    chapterIdx: number | null;
    chapterTitle?: string;
    pageIndex: number;
    readingMode: ReaderMode;
  }>({
    workId: null,
    chapterIdx: null,
    chapterTitle: undefined,
    pageIndex: 0,
    readingMode: comfortConfig.readingMode,
  });

  const snapshotCurrentScrollProgress = useCallback(() => {
    const ctx = readingContextRef.current;
    if (!ctx.workId) return null;
    const el = scrollContainerRef.current;
    const scrollTop = el ? Math.max(0, Math.round(el.scrollTop)) : 0;
    const maxScroll = el ? Math.max(0, Math.round(el.scrollHeight - el.clientHeight)) : 0;
    const scrollRatio = maxScroll > 4 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
    const percent = maxScroll > 4 ? Math.round(scrollRatio * 100) : 0;
    const snap: SavedReadingProgress = {
      workId: ctx.workId,
      scrollTop,
      maxScroll,
      scrollRatio,
      percent,
      chapterIdx: ctx.chapterIdx,
      chapterTitle: ctx.chapterTitle,
      pageIndex: ctx.pageIndex,
      readingMode: ctx.readingMode,
      updatedAt: Date.now(),
    };
    liveProgressRef.current = snap;
    return snap;
  }, []);

  const persistCurrentProgress = useCallback(() => {
    if (!hasUserInteractedRef.current) return;
    const snap = liveProgressRef.current;
    if (!snap || !snap.workId) return;
    if (hasMeaningfulProgress(snap)) {
      saveReadingProgressEntry({ ...snap, updatedAt: Date.now() });
    } else {
      removeReadingProgressEntry(snap.workId);
    }
  }, []);

  const updateScrollProgress = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 4) {
      setIsScrollable(false);
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = 'scaleX(1)';
      }
      if (lastPctRef.current !== 100) {
        lastPctRef.current = 100;
        setReadingProgress(100);
      }
    } else {
      setIsScrollable(true);
      const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${ratio})`;
      }
      const nextPct = Math.round(ratio * 100);
      if (lastPctRef.current !== nextPct) {
        lastPctRef.current = nextPct;
        setReadingProgress(nextPct);
      }
    }

    if (el.scrollTop >= 24 && !pendingScrollRestoreRef.current) {
      hasUserInteractedRef.current = true;
    }
    if (el.scrollTop >= 220) {
      setResumePrompt((prev) => (prev ? null : prev));
    }
    if (hasUserInteractedRef.current) {
      snapshotCurrentScrollProgress();
    }
  }, [snapshotCurrentScrollProgress]);

  const handleMainScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateScrollProgress();
    });
  }, [updateScrollProgress]);

  useEffect(() => {
    const currentId = work?.id || null;
    if (!currentId) {
      setResumePrompt(null);
      liveProgressRef.current = null;
      hasUserInteractedRef.current = false;
      pendingScrollRestoreRef.current = null;
      return;
    }

    setActiveChapterIdx(null);
    setActivePageIndex(0);
    setConfirmDelete(false);
    setComfortMenuOpen(false);
    setZoomed(false);
    setSelectedText('');
    setCopyToast(null);
    setFullCopied(false);
    hasUserInteractedRef.current = false;
    liveProgressRef.current = null;
    pendingScrollRestoreRef.current = null;

    const saved = loadReadingProgressMap()[currentId];
    if (saved && hasMeaningfulProgress(saved)) {
      setResumePrompt(saved);
    } else {
      setResumePrompt(null);
    }

    return () => {
      persistCurrentProgress();
    };
  }, [work?.id, persistCurrentProgress]);

  // Save reading position if browser tab/app is backgrounded or unloaded while reader is open
  useEffect(() => {
    if (!work?.id) return;
    const handleBeforeUnload = () => {
      persistCurrentProgress();
    };
    window.addEventListener('pagehide', handleBeforeUnload);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', handleBeforeUnload);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [work?.id, persistCurrentProgress]);

  const handleChapterSelect = useCallback(
    (targetIdx: number) => {
      hasUserInteractedRef.current = true;
      setResumePrompt(null);
      setChapterDirection(activeChapterIdx === null || targetIdx >= activeChapterIdx ? 1 : -1);
      setActiveChapterIdx(targetIdx);
      setActivePageIndex(0);
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = 0;
    },
    [activeChapterIdx]
  );

  const handlePageChange = useCallback(
    (nextIdx: number) => {
      hasUserInteractedRef.current = true;
      setResumePrompt(null);
      setPageDirection(nextIdx > activePageIndex ? 1 : -1);
      setActivePageIndex(nextIdx);
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = 0;
    },
    [activePageIndex]
  );

  useEffect(() => {
    if (pendingScrollRestoreRef.current) {
      return;
    }
    lastPctRef.current = 0;
    setReadingProgress(0);
    setSelectedText('');
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = 0;
    }
    const timer = setTimeout(updateScrollProgress, 60);
    return () => {
      clearTimeout(timer);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [work?.id, comfortConfig, activeChapterIdx, updateScrollProgress]);

  // Apply deferred scroll restoration after chapter/page transitions complete
  useEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending) return;
    if (pending.chapterIdx !== null && activeChapterIdx !== pending.chapterIdx) return;

    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    const delayMs = pending.chapterIdx !== null ? 260 : 70;
    resumeTimerRef.current = window.setTimeout(() => {
      pendingScrollRestoreRef.current = null;
      const el = scrollContainerRef.current;
      if (el) {
        const currentMax = Math.max(0, el.scrollHeight - el.clientHeight);
        const targetTop =
          pending.scrollTop > 0 && currentMax > 0
            ? pending.maxScroll > 0 && Math.abs(currentMax - pending.maxScroll) > 80
              ? Math.round(pending.scrollRatio * currentMax)
              : Math.min(currentMax, pending.scrollTop)
            : 0;
        if (targetTop > 0) {
          el.scrollTo({ top: targetTop, behavior: 'smooth' });
        }
      }
      hasUserInteractedRef.current = true;
      snapshotCurrentScrollProgress();
      window.setTimeout(updateScrollProgress, 120);
    }, delayMs);

    return () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    };
  }, [
    activeChapterIdx,
    activePageIndex,
    comfortConfig.readingMode,
    snapshotCurrentScrollProgress,
    updateScrollProgress,
  ]);

  // Track active text selection for one-tap copying to Share Card Studio
  useEffect(() => {
    if (!work || work.type !== 'writing') {
      setSelectedText('');
      return;
    }

    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectedText('');
        return;
      }
      const raw = sel.toString().trim();
      if (!raw) {
        setSelectedText('');
        return;
      }
      const anchorNode = sel.anchorNode;
      if (proseRef.current && anchorNode && proseRef.current.contains(anchorNode)) {
        setSelectedText(raw);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [work]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (fullCopyTimerRef.current) window.clearTimeout(fullCopyTimerRef.current);
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const showToast = (text: string, isCopied: boolean) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setCopyToast({ text, isCopied });
    toastTimerRef.current = window.setTimeout(() => {
      setCopyToast(null);
    }, isCopied ? 3200 : 2500);
  };

  const copyTextToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below for offline WebView
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopySelection = async () => {
    const liveSel = window.getSelection()?.toString().trim() || '';
    const textToCopy = liveSel || selectedText.trim();
    if (!textToCopy) {
      showToast('請先在內文中反白選取要複製的文字段落', false);
      return;
    }
    const ok = await copyTextToClipboard(textToCopy);
    if (ok) {
      showToast('已複製到剪貼簿以便在分享圖卡中使用', true);
    } else {
      showToast('無法寫入剪貼簿，請長按系統複製選單', false);
    }
  };

  if (!work) return null;

  const isChapterNovel =
    work.type === 'writing' &&
    work.writingGenre === '章節小說' &&
    Array.isArray(work.chapters) &&
    work.chapters.length > 0;
  const chapters = isChapterNovel ? work.chapters! : [];
  const activeChapter =
    isChapterNovel && activeChapterIdx !== null ? chapters[activeChapterIdx] || null : null;

  const safeChapterTitleForStorage = work.isPrivate ? undefined : activeChapter?.title;
  readingContextRef.current = {
    workId: work.id,
    chapterIdx: isChapterNovel ? activeChapterIdx : null,
    chapterTitle: safeChapterTitleForStorage,
    pageIndex: activePageIndex,
    readingMode: comfortConfig.readingMode,
  };
  if (hasUserInteractedRef.current) {
    const el = scrollContainerRef.current;
    const scrollTop = el ? Math.max(0, Math.round(el.scrollTop)) : 0;
    const maxScroll = el ? Math.max(0, Math.round(el.scrollHeight - el.clientHeight)) : 0;
    const scrollRatio = maxScroll > 4 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
    liveProgressRef.current = {
      workId: work.id,
      scrollTop,
      maxScroll,
      scrollRatio,
      percent: maxScroll > 4 ? Math.round(scrollRatio * 100) : 0,
      chapterIdx: isChapterNovel ? activeChapterIdx : null,
      chapterTitle: safeChapterTitleForStorage,
      pageIndex: activePageIndex,
      readingMode: comfortConfig.readingMode,
      updatedAt: Date.now(),
    };
  }

  const handleResumeReadingProgress = () => {
    if (!resumePrompt) return;
    const saved = resumePrompt;
    setResumePrompt(null);
    hasUserInteractedRef.current = true;

    const targetChapterIdx =
      isChapterNovel &&
      saved.chapterIdx !== null &&
      saved.chapterIdx >= 0 &&
      saved.chapterIdx < chapters.length
        ? saved.chapterIdx
        : null;
    const needsChapterSwitch = targetChapterIdx !== null && targetChapterIdx !== activeChapterIdx;
    const needsModeSwitch = saved.readingMode !== comfortConfig.readingMode;

    pendingScrollRestoreRef.current = saved;

    if (needsModeSwitch) {
      setComfortConfig((prev) => ({ ...prev, readingMode: saved.readingMode }));
    }
    if (needsChapterSwitch && targetChapterIdx !== null) {
      setChapterDirection(1);
      setActiveChapterIdx(targetChapterIdx);
    }
    if (saved.readingMode === 'paged') {
      setActivePageIndex(saved.pageIndex);
    }

    if (!needsChapterSwitch && !needsModeSwitch && (saved.readingMode !== 'paged' || saved.pageIndex === activePageIndex)) {
      const el = scrollContainerRef.current;
      if (el && saved.scrollTop > 0) {
        const currentMax = Math.max(0, el.scrollHeight - el.clientHeight);
        const targetTop =
          saved.maxScroll > 0 && Math.abs(currentMax - saved.maxScroll) > 80
            ? Math.round(saved.scrollRatio * currentMax)
            : Math.min(currentMax, saved.scrollTop);
        el.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
      pendingScrollRestoreRef.current = null;
      window.setTimeout(() => {
        snapshotCurrentScrollProgress();
        updateScrollProgress();
      }, 120);
    }

    const detail =
      targetChapterIdx !== null
        ? `第 ${targetChapterIdx + 1} 章${saved.percent > 0 ? ` · ${saved.percent}%` : ''}`
        : saved.readingMode === 'paged' && saved.pageIndex > 0
        ? `第 ${saved.pageIndex + 1} 頁${saved.percent > 0 ? `（${saved.percent}%）` : ''}`
        : `${saved.percent}%`;
    showToast(`已回到上次閱讀位置（${detail}）`, true);
  };

  const handleDismissResumePrompt = () => {
    setResumePrompt(null);
    hasUserInteractedRef.current = true;
    removeReadingProgressEntry(work.id);
    snapshotCurrentScrollProgress();
  };

  const resumeSummaryLabel = (() => {
    if (!resumePrompt) return '';
    const parts: string[] = [];
    if (
      isChapterNovel &&
      resumePrompt.chapterIdx !== null &&
      resumePrompt.chapterIdx >= 0 &&
      resumePrompt.chapterIdx < chapters.length
    ) {
      const chName = chapters[resumePrompt.chapterIdx]?.title || resumePrompt.chapterTitle;
      parts.push(
        chName
          ? `第 ${resumePrompt.chapterIdx + 1} 章《${chName}》`
          : `第 ${resumePrompt.chapterIdx + 1} 章`
      );
    }
    if (resumePrompt.readingMode === 'paged' && resumePrompt.pageIndex > 0) {
      parts.push(`第 ${resumePrompt.pageIndex + 1} 頁`);
    }
    if (resumePrompt.percent > 0) {
      parts.push(`進度 ${resumePrompt.percent}%`);
    } else if (resumePrompt.scrollTop >= 48) {
      parts.push('已捲動位置');
    }
    return parts.join(' · ') || '上次閱讀位置';
  })();

  const collectionName = work.collectionId
    ? collections.find((c) => c.id === work.collectionId)?.name || '未分類'
    : '未分類';
  const charCount = isChapterNovel
    ? chapters.reduce((sum, ch) => sum + ch.content.replace(/\s+/g, '').length, 0)
    : work.content
    ? work.content.replace(/\s+/g, '').length
    : 0;

  const fullBodyCopyText = isChapterNovel
    ? activeChapter !== null
      ? `${activeChapter.title}\n\n${activeChapter.content}`.trim()
      : chapters.map((ch) => `${ch.title}\n\n${ch.content}`).join('\n\n').trim()
    : (work.content || '').trim();
  const hasFullBodyText = fullBodyCopyText.length > 0;
  const isFullTextTooLong = fullBodyCopyText.length > MAX_FULL_COPY_CHARS;

  const handleCopyFullBody = async () => {
    if (!fullBodyCopyText) {
      showToast('此作品尚無可複製的內文文字', false);
      return;
    }
    if (fullBodyCopyText.length > MAX_FULL_COPY_CHARS) {
      showToast(
        `內文超過 ${MAX_FULL_COPY_CHARS.toLocaleString()} 字上限，請改用反白分段複製或匯出檔案`,
        false
      );
      return;
    }
    const ok = await copyTextToClipboard(fullBodyCopyText);
    if (ok) {
      setFullCopied(true);
      if (fullCopyTimerRef.current) window.clearTimeout(fullCopyTimerRef.current);
      fullCopyTimerRef.current = window.setTimeout(() => setFullCopied(false), 1800);
      const cleanCount = fullBodyCopyText.replace(/\s+/g, '').length;
      showToast(`已複製全部內文（共 ${cleanCount.toLocaleString()} 字）`, true);
    } else {
      showToast('無法寫入剪貼簿，請長按文字使用系統複製選單', false);
    }
  };

  const workHasMarkdown = isChapterNovel
    ? chapters.some((ch) => hasMarkdownSyntax(ch.content))
    : hasMarkdownSyntax(work.content || '');
  const effectiveMarkdown =
    work.useMarkdown !== undefined
      ? Boolean(work.useMarkdown)
      : defaultMarkdownEnabled;

  const activePresetId =
    COMFORT_PRESETS.find(
      (p) =>
        p.config.fontSizePx === comfortConfig.fontSizePx &&
        p.config.lineHeight === comfortConfig.lineHeight &&
        p.config.maxWidthCh === comfortConfig.maxWidthCh &&
        p.config.comfortableSpacing === comfortConfig.comfortableSpacing
    )?.id ?? null;

  return (
    <AnimatePresence>
      <motion.div
        initial={
          animationOverhaul
            ? { opacity: 0, y: 24 }
            : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        exit={
          animationOverhaul
            ? { opacity: 0, y: 20 }
            : { opacity: 0 }
        }
        transition={
          animationOverhaul
            ? { duration: 0.26, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.16 }
        }
        className="fixed inset-0 z-50 bg-[#F7F6F2] dark:bg-[#111110] flex flex-col overflow-hidden"
      >
        {/* Sticky Top Bar */}
        <header className="pt-safe shrink-0 border-b border-stone-200/80 dark:border-stone-800/80 bg-[#F7F6F2] dark:bg-[#111110]">
          <div className="max-w-4xl mx-auto px-2.5 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                persistCurrentProgress();
                setConfirmDelete(false);
                setZoomed(false);
                onClose();
              }}
              className="min-h-[40px] px-2 -ml-1 flex items-center gap-1 text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-5 h-5 shrink-0" />
              <span className="hidden xs:inline sm:inline">返回</span>
            </button>

            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1 justify-end max-w-[calc(100vw-56px)] sm:max-w-none overflow-x-auto no-scrollbar py-1 pr-1">
              {work.type === 'writing' && (
                <>
                  {(!isChapterNovel || activeChapter !== null) && (
                    <span className="text-[11px] tabular-nums text-stone-400 dark:text-stone-500 mr-1 hidden md:inline shrink-0">
                       閱讀進度 {isScrollable ? readingProgress : 100}%
                    </span>
                  )}
                  {isChapterNovel && activeChapter !== null && (
                    <button
                      type="button"
                      onClick={() => setActiveChapterIdx(null)}
                      title="返回目錄"
                      className="min-h-[36px] sm:min-h-[38px] px-2 sm:px-2.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800/50 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <List className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">目錄</span>
                    </button>
                  )}
                  {(!isChapterNovel || activeChapter !== null) && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => void handleCopySelection()}
                      title="複製當前反白選取的文字段落"
                      className={`min-h-[36px] sm:min-h-[38px] px-2 sm:px-2.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        selectedText
                          ? 'bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-[#E7E5E0]'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <Copy className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">複製</span>
                    </button>
                  )}
                  {hasFullBodyText && (
                    <button
                      type="button"
                      disabled={isFullTextTooLong}
                      onClick={() => void handleCopyFullBody()}
                      aria-label={isFullTextTooLong ? '內文過長，無法一次複製全文' : '一次複製作品全部內文'}
                      title={
                        isFullTextTooLong
                          ? `內文超過 ${MAX_FULL_COPY_CHARS.toLocaleString()} 字（目前 ${fullBodyCopyText.length.toLocaleString()} 字），為避免卡頓請反白分段複製或匯出`
                          : isChapterNovel && activeChapter
                          ? '一次複製本章全部內文'
                          : '一次複製作品全部內文'
                      }
                      className={`min-h-[36px] sm:min-h-[38px] px-2 sm:px-2.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        isFullTextTooLong
                          ? 'text-stone-400 dark:text-stone-600 opacity-50 cursor-not-allowed'
                          : fullCopied
                          ? 'bg-[#284152] text-white dark:bg-[#E7E5E0] dark:text-stone-900'
                          : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      {fullCopied ? (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="xs:hidden text-[11px] font-medium">
                        {isFullTextTooLong ? '過長' : fullCopied ? '已複製' : '全文'}
                      </span>
                      <span className="hidden xs:inline">
                        {isFullTextTooLong ? '全文過長' : fullCopied ? '已複製全文' : '複製全文'}
                      </span>
                    </button>
                  )}
                  {!minimalMode && workHasMarkdown && onToggleMarkdown && (!isChapterNovel || activeChapter !== null) && (
                    <button
                      type="button"
                      onClick={() => onToggleMarkdown(work)}
                      title={effectiveMarkdown ? '目前套用 Markdown 排版（點擊切換純文字）' : '目前顯示純文字（點擊套用 Markdown 排版）'}
                      className={`min-h-[34px] px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        effectiveMarkdown
                          ? 'bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-[#E7E5E0]'
                          : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <span className="xs:hidden font-mono text-[11px] font-semibold">{effectiveMarkdown ? 'MD' : 'TXT'}</span>
                      <span className="hidden xs:inline">{effectiveMarkdown ? 'MD 已套用' : '純文字'}</span>
                    </button>
                  )}
                  {!minimalMode && (!isChapterNovel || activeChapter !== null) && (
                    <button
                      type="button"
                      onClick={() =>
                        setComfortConfig((prev) => ({
                          ...prev,
                          readingMode: prev.readingMode === 'paged' ? 'scroll' : 'paged',
                        }))
                      }
                      title={
                        comfortConfig.readingMode === 'paged'
                          ? '目前為分頁閱讀模式（點擊切換為連續捲動）'
                          : '目前為連續捲動模式（點擊切換為分頁閱讀）'
                      }
                      className={`min-h-[34px] px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1 ${
                        comfortConfig.readingMode === 'paged'
                          ? 'bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-[#E7E5E0]'
                          : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="xs:hidden font-mono text-[11px] font-semibold">{comfortConfig.readingMode === 'paged' ? '分頁' : '捲動'}</span>
                      <span className="hidden xs:inline">{comfortConfig.readingMode === 'paged' ? '分頁模式' : '連續模式'}</span>
                    </button>
                  )}
                  {!minimalMode && (
                    <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setComfortMenuOpen((prev) => !prev)}
                      title="舒適閱讀版面設定"
                      className={`min-h-[36px] sm:min-h-[38px] px-2 sm:px-2.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        comfortMenuOpen
                          ? 'bg-[#284152] text-white dark:bg-[#E7E5E0] dark:text-stone-900'
                          : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">舒適閱讀</span>
                    </button>

                    <AnimatePresence>
                      {comfortMenuOpen && (
                        <>
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: animationOverhaul ? 0.2 : 0.12 }}
                            className="fixed inset-0 z-40"
                            onClick={() => setComfortMenuOpen(false)}
                          />
                          <motion.div
                            initial={
                              animationOverhaul
                                ? { opacity: 0, y: -12, scale: 0.94 }
                                : { opacity: 0, y: -4 }
                            }
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={
                              animationOverhaul
                                ? { opacity: 0, y: -10, scale: 0.95 }
                                : { opacity: 0, y: -4 }
                            }
                            transition={{
                              duration: animationOverhaul ? 0.24 : 0.14,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="absolute right-0 top-full mt-2 w-[300px] sm:w-[330px] z-50 rounded-2xl bg-[#F7F6F2] dark:bg-[#191918] border border-stone-200 dark:border-stone-800 shadow-2xl p-4 space-y-4 origin-top-right"
                          >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-stone-800 dark:text-stone-100">
                              舒適閱讀版面設定
                            </span>
                            <button
                              type="button"
                              onClick={() => setComfortConfig(DEFAULT_COMFORT_CONFIG)}
                              className="text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>重設</span>
                            </button>
                          </div>

                          {/* One-tap presets */}
                          <div>
                            <div className="text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                              快速模式
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {COMFORT_PRESETS.map((preset) => {
                                const active = activePresetId === preset.id;
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setComfortConfig(preset.config)}
                                    className={`min-h-[34px] px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                                      active
                                        ? 'bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 border-transparent'
                                        : 'bg-white dark:bg-[#222220] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Reading Mode */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                              <span>版面瀏覽模式</span>
                              <span className="tabular-nums">
                                {comfortConfig.readingMode === 'paged' ? '分頁視圖' : '連續捲動'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setComfortConfig((prev) => ({
                                    ...prev,
                                    readingMode: 'scroll',
                                  }))
                                }
                                className={`min-h-[34px] rounded-lg text-xs font-medium border transition-colors ${
                                  comfortConfig.readingMode !== 'paged'
                                    ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                                    : 'bg-white dark:bg-[#222220] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                                }`}
                              >
                                連續捲動
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setComfortConfig((prev) => ({
                                    ...prev,
                                    readingMode: 'paged',
                                  }))
                                }
                                className={`min-h-[34px] rounded-lg text-xs font-medium border transition-colors ${
                                  comfortConfig.readingMode === 'paged'
                                    ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                                    : 'bg-white dark:bg-[#222220] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                                }`}
                              >
                                分頁閱讀（防卡頓）
                              </button>
                            </div>
                          </div>

                          {/* Font Size */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                              <span>字體大小</span>
                              <span className="tabular-nums">{comfortConfig.fontSizePx}px</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {(
                                [
                                  { value: 15, label: '小' },
                                  { value: 17, label: '標準' },
                                  { value: 19, label: '大' },
                                  { value: 21, label: '特大' },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    setComfortConfig((prev) => ({
                                      ...prev,
                                      fontSizePx: opt.value,
                                    }))
                                  }
                                  className={`min-h-[34px] rounded-lg text-xs font-medium border transition-colors ${
                                    comfortConfig.fontSizePx === opt.value
                                      ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                                      : 'bg-white dark:bg-[#222220] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Line Height */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                              <span>行高間距</span>
                              <span className="tabular-nums">{comfortConfig.lineHeight}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {(
                                [
                                  { value: 1.65, label: '緊湊' },
                                  { value: 1.85, label: '標準' },
                                  { value: 1.95, label: '舒適' },
                                  { value: 2.15, label: '寬鬆' },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    setComfortConfig((prev) => ({
                                      ...prev,
                                      lineHeight: opt.value,
                                    }))
                                  }
                                  className={`min-h-[34px] rounded-lg text-xs font-medium border transition-colors ${
                                    comfortConfig.lineHeight === opt.value
                                      ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                                      : 'bg-white dark:bg-[#222220] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Column Width */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                              <span>版心寬度</span>
                              <span className="tabular-nums">{comfortConfig.maxWidthCh} 字寬</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(
                                [
                                  { value: 54, label: '窄幅聚焦' },
                                  { value: 65, label: '標準版心' },
                                  { value: 76, label: '寬幅展開' },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    setComfortConfig((prev) => ({
                                      ...prev,
                                      maxWidthCh: opt.value,
                                    }))
                                  }
                                  className={`min-h-[34px] rounded-lg text-xs font-medium border transition-colors ${
                                    comfortConfig.maxWidthCh === opt.value
                                      ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                                      : 'bg-white dark:bg-[#222220] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Paragraph Breath Toggle */}
                          <label className="flex items-center justify-between pt-2 border-t border-stone-200/80 dark:border-stone-800 cursor-pointer">
                            <span className="text-xs text-stone-700 dark:text-stone-300">
                              段落留白呼吸感
                            </span>
                            <input
                              type="checkbox"
                              checked={comfortConfig.comfortableSpacing}
                              onChange={(e) =>
                                setComfortConfig((prev) => ({
                                  ...prev,
                                  comfortableSpacing: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 accent-[#284152]"
                            />
                          </label>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                  )}
                </>
              )}

              {!minimalMode && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(work)}
                  aria-label={work.favorite ? '取消收藏' : '加入收藏'}
                  title={work.favorite ? '取消收藏' : '加入收藏'}
                  className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200/50 dark:hover:bg-stone-800/50 transition-colors shrink-0"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      work.favorite
                        ? 'fill-[#9E3B33] text-[#9E3B33] dark:fill-[#E07A70] dark:text-[#E07A70]'
                        : ''
                    }`}
                  />
                </button>
              )}

              <button
                type="button"
                onClick={() => onTogglePrivate(work)}
                aria-label={work.isPrivate ? '解除私密設定' : '設為私密加密'}
                title={work.isPrivate ? '目前為私密作品（點擊可轉為公開）' : '設為私密作品'}
                className={`min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                  work.isPrivate
                    ? 'text-[#284152] dark:text-[#E07A70] bg-stone-200/60 dark:bg-stone-800'
                    : 'text-stone-500 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                }`}
              >
                {work.isPrivate ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>

              {!minimalMode && (
                <button
                  type="button"
                  onClick={() => onOpenShareStudio(work)}
                  title="生成分享圖卡"
                  className="min-h-[36px] sm:min-h-[38px] px-2 sm:px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 ml-0.5"
                >
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">生成分享圖卡</span>
                  <span className="hidden xs:inline sm:hidden">圖卡</span>
                </button>
              )}
            </div>
          </div>

          {/* Reading Progress Bar for Long-form Writing */}
          {work.type === 'writing' && (!isChapterNovel || activeChapter !== null) && (
            <div
              role="progressbar"
              aria-label="閱讀進度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={isScrollable ? readingProgress : 100}
              className="w-full h-[3px] bg-stone-200/70 dark:bg-stone-800/80 overflow-hidden"
            >
              <div
                ref={progressBarRef}
                className="h-full bg-[#284152] dark:bg-[#C96458] origin-left will-change-transform"
                style={{
                  transform: `scaleX(${(isScrollable ? readingProgress : 100) / 100})`,
                }}
              />
            </div>
          )}

          {/* Resume Reading Position Prompt Banner */}
          <AnimatePresence>
            {resumePrompt && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className="border-t border-stone-200/70 dark:border-stone-800/80 bg-[#EFECE6] dark:bg-[#191918]"
              >
                <div className="max-w-3xl mx-auto px-3.5 sm:px-8 py-2 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0 text-xs text-stone-700 dark:text-stone-300">
                    <Bookmark className="w-3.5 h-3.5 text-[#9E3B33] dark:text-[#E07A70] shrink-0" />
                    <span className="truncate">
                      {conciseCopyMode ? '上次讀至：' : '偵測到上次閱讀紀錄：'}
                      <strong className="font-medium text-stone-900 dark:text-stone-100">{resumeSummaryLabel}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleResumeReadingProgress}
                      className="min-h-[30px] px-2.5 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-[11px] font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                      回到上次位置
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissResumePrompt}
                      aria-label="從頭閱讀並忽略上次進度"
                      title="從頭閱讀"
                      className="min-h-[30px] min-w-[30px] px-1.5 rounded-lg text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 inline-flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Scrollable Content */}
        <main
          ref={scrollContainerRef}
          onScroll={handleMainScroll}
          className="flex-1 overflow-y-auto overscroll-contain pb-safe"
        >
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
            {/* Metadata Header (Zero-Pill unboxed text) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400 mb-3">
              <span>{work.type === 'photography' ? '攝影紀實' : work.writingGenre || '文字創作'}</span>
              <span aria-hidden="true">·</span>
              <span>{collectionName}{work.category ? ` / ${work.category}` : ''}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{work.createdAt}</span>
              {work.isPrivate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#9E3B33] dark:text-[#E07A70]">私密加密</span>
                </>
              )}
            </div>

            <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-stone-900 dark:text-stone-100 leading-tight mb-2 text-balance">
              {work.title}
            </h1>

            {work.subtitle && (
              <p className="text-base text-stone-500 dark:text-stone-400 mb-6">
                {work.subtitle}
              </p>
            )}

            {/* Photography Plate */}
            {work.type === 'photography' && work.imageData && (
              <div className="my-6">
                <div className="relative rounded-2xl overflow-hidden bg-stone-200/50 dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800">
                  <img
                    src={work.imageData}
                    alt={work.title}
                    referrerPolicy="no-referrer"
                    onClick={() => setZoomed((z) => !z)}
                    className={`w-full mx-auto cursor-zoom-in transition-transform duration-300 ${
                      zoomed ? 'scale-125 cursor-zoom-out' : 'max-h-[72vh] object-contain'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setZoomed((z) => !z)}
                    aria-label={zoomed ? '縮小檢視' : '放大檢視'}
                    className="absolute bottom-3 right-3 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                  </button>
                </div>

                {/* EXIF / Camera Notes */}
                {work.photoMeta &&
                  Object.values(work.photoMeta).some((v) => v && v.trim() !== '') && (
                    <div className="mt-4 py-3 px-4 rounded-xl bg-[#EFECE6]/70 dark:bg-[#191918] border border-stone-200/70 dark:border-stone-800 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-600 dark:text-stone-300 tabular-nums">
                      {work.photoMeta.camera && <span>相機：{work.photoMeta.camera}</span>}
                      {work.photoMeta.lens && <span>鏡頭：{work.photoMeta.lens}</span>}
                      {work.photoMeta.film && <span>底片/色調：{work.photoMeta.film}</span>}
                      {(work.photoMeta.aperture ||
                        work.photoMeta.shutter ||
                        work.photoMeta.iso) && (
                        <span>
                          參數：
                          {[
                            work.photoMeta.aperture,
                            work.photoMeta.shutter,
                            work.photoMeta.iso ? `ISO ${work.photoMeta.iso}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                      {work.photoMeta.location && <span>地點：{work.photoMeta.location}</span>}
                    </div>
                  )}
              </div>
            )}

            {/* Literary Body OR Chapter Novel TOC / Chapter View */}
            {isChapterNovel ? (
              activeChapter === null ? (
                <div className="mt-6 space-y-6">
                  <div className="p-5 rounded-2xl bg-[#EFECE6]/75 dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                        章節小說 · 共 {chapters.length} 章 · 全書 {charCount.toLocaleString()} 字
                      </div>
                      <p className="text-sm text-stone-700 dark:text-stone-300 mt-1">
                        點擊下方任一章節直接閱讀，或從第一章依序展開。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleChapterSelect(0)}
                      className="min-h-[44px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shrink-0"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>開始閱讀</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xs font-medium tracking-wider text-stone-500 dark:text-stone-400 px-1">
                      章節目錄
                    </h2>
                    <div className="bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 rounded-2xl divide-y divide-stone-100 dark:divide-stone-800/80 overflow-hidden">
                      {chapters.map((ch, idx) => {
                        const chWords = ch.content.replace(/\s+/g, '').length;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => handleChapterSelect(idx)}
                            className="w-full min-h-[54px] px-4 sm:px-5 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-stone-100/70 dark:hover:bg-stone-800/50 transition-colors group"
                          >
                            <div className="flex items-baseline gap-3 min-w-0">
                              <span className="text-xs tabular-nums text-stone-400 shrink-0">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <span className="font-editorial text-lg font-medium text-stone-900 dark:text-stone-100 truncate">
                                {ch.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-xs text-stone-400 tabular-nums">
                              <span>{chWords} 字</span>
                              <ChevronRight className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-600 dark:group-hover:text-stone-300 transition-colors" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait" custom={chapterDirection}>
                  <motion.div
                    key={`chapter_${activeChapter.id}`}
                    custom={chapterDirection}
                    initial={{ opacity: 0, x: chapterDirection * 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -chapterDirection * 24 }}
                    transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                    className="mt-4 space-y-6"
                  >
                    <div className="flex items-center justify-between gap-3 pb-4 border-b border-stone-200/80 dark:border-stone-800">
                      <button
                        type="button"
                        onClick={() => setActiveChapterIdx(null)}
                        className="min-h-[38px] px-3 -ml-3 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-200/50 dark:hover:bg-stone-800 inline-flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>返回章節目錄</span>
                      </button>
                      <span className="text-xs tabular-nums text-stone-400">
                        第 {(activeChapterIdx ?? 0) + 1} / {chapters.length} 章
                      </span>
                    </div>

                    <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
                      {activeChapter.title}
                    </h2>

                    {/* Chapter Body: Paged OR Continuous */}
                    {comfortConfig.readingMode === 'paged' ? (
                      (() => {
                        const chPages = splitContentIntoPages(activeChapter.content, 1100);
                        const clampedPage = Math.min(activePageIndex, Math.max(0, chPages.length - 1));
                        const pageText = chPages[clampedPage] || '';
                        return (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-[#EFECE6]/60 dark:bg-[#1a1a18] text-xs text-stone-600 dark:text-stone-300">
                              <span className="tabular-nums">
                                分頁閱讀 · 第 <strong className="text-stone-900 dark:text-stone-100 font-semibold">{clampedPage + 1}</strong> / {chPages.length} 頁
                              </span>
                              <span className="text-[11px] tabular-nums text-stone-400">
                                本頁約 {pageText.replace(/\s+/g, '').length} 字
                              </span>
                            </div>

                            <AnimatePresence mode="wait" custom={pageDirection}>
                              <motion.div
                                key={`ch_p_${activeChapter.id}_${clampedPage}`}
                                custom={pageDirection}
                                initial={{ opacity: 0, x: pageDirection * 18 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -pageDirection * 18 }}
                                transition={{ duration: 0.16 }}
                                ref={proseRef}
                                style={proseComfortStyle}
                                className={`selectable-text text-stone-800 dark:text-stone-200 font-ui reader-comfortable-prose ${
                                  comfortConfig.comfortableSpacing ? 'is-comfort-active' : ''
                                }`}
                              >
                                <ReaderMarkdownBody content={pageText} enabled={effectiveMarkdown} />
                              </motion.div>
                            </AnimatePresence>

                            <div className="pt-3 flex items-center justify-between gap-2 border-t border-stone-200/60 dark:border-stone-800/60">
                              <button
                                type="button"
                                disabled={clampedPage <= 0}
                                onClick={() => handlePageChange(clampedPage - 1)}
                                className="min-h-[40px] px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1 disabled:opacity-30 hover:bg-stone-200/40 dark:hover:bg-stone-800 transition-colors"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                                <span>上一頁</span>
                              </button>

                              <span className="text-xs tabular-nums text-stone-500">
                                {clampedPage + 1} / {chPages.length}
                              </span>

                              {clampedPage < chPages.length - 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handlePageChange(clampedPage + 1)}
                                  className="min-h-[40px] px-3.5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1 hover:opacity-90 transition-opacity"
                                >
                                  <span>下一頁</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              ) : (activeChapterIdx ?? 0) < chapters.length - 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handleChapterSelect((activeChapterIdx ?? 0) + 1)}
                                  className="min-h-[40px] px-3.5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1 hover:opacity-90 transition-opacity"
                                >
                                  <span>下一章</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-xs text-stone-400">已達全書末頁</span>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div
                        ref={proseRef}
                        style={proseComfortStyle}
                        className={`selectable-text text-stone-800 dark:text-stone-200 font-ui reader-comfortable-prose ${
                          comfortConfig.comfortableSpacing ? 'is-comfort-active' : ''
                        }`}
                      >
                        <ChunkedReaderBody
                          content={activeChapter.content}
                          enabled={effectiveMarkdown}
                        />
                      </div>
                    )}

                    {/* Prev / TOC / Next Chapter Bar */}
                    <div className="pt-6 border-t border-stone-200/70 dark:border-stone-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={(activeChapterIdx ?? 0) <= 0}
                        onClick={() =>
                          handleChapterSelect(
                            activeChapterIdx !== null && activeChapterIdx > 0
                              ? activeChapterIdx - 1
                              : 0
                          )
                        }
                        className="min-h-[44px] px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1 disabled:opacity-35 hover:bg-stone-200/40 dark:hover:bg-stone-800 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>上一章</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveChapterIdx(null)}
                        className="min-h-[44px] px-3.5 rounded-xl text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 inline-flex items-center gap-1.5"
                      >
                        <List className="w-4 h-4" />
                        <span>章節目錄</span>
                      </button>

                      <button
                        type="button"
                        disabled={(activeChapterIdx ?? 0) >= chapters.length - 1}
                        onClick={() =>
                          handleChapterSelect(
                            activeChapterIdx !== null && activeChapterIdx < chapters.length - 1
                              ? activeChapterIdx + 1
                              : chapters.length - 1
                          )
                        }
                        className="min-h-[44px] px-3.5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-35 hover:opacity-90 transition-opacity"
                      >
                        <span>下一章</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              )
            ) : (
              work.content && (
                comfortConfig.readingMode === 'paged' ? (
                  (() => {
                    const textPages = splitContentIntoPages(work.content, 1100);
                    const clampedPage = Math.min(activePageIndex, Math.max(0, textPages.length - 1));
                    const pageText = textPages[clampedPage] || '';
                    return (
                      <div className="mt-6 space-y-4">
                        <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-[#EFECE6]/60 dark:bg-[#1a1a18] text-xs text-stone-600 dark:text-stone-300">
                          <span className="tabular-nums">
                            分頁閱讀 · 第 <strong className="text-stone-900 dark:text-stone-100 font-semibold">{clampedPage + 1}</strong> / {textPages.length} 頁
                          </span>
                          <span className="text-[11px] tabular-nums text-stone-400">
                            本頁約 {pageText.replace(/\s+/g, '').length} 字 · 全文 {charCount} 字
                          </span>
                        </div>

                        <AnimatePresence mode="wait" custom={pageDirection}>
                          <motion.div
                            key={`work_p_${work.id}_${clampedPage}`}
                            custom={pageDirection}
                            initial={{ opacity: 0, x: pageDirection * 18 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -pageDirection * 18 }}
                            transition={{ duration: 0.16 }}
                            ref={proseRef}
                            style={proseComfortStyle}
                            className={`selectable-text text-stone-800 dark:text-stone-200 font-ui reader-comfortable-prose ${
                              comfortConfig.comfortableSpacing ? 'is-comfort-active' : ''
                            }`}
                          >
                            <ReaderMarkdownBody content={pageText} enabled={effectiveMarkdown} />
                          </motion.div>
                        </AnimatePresence>

                        <div className="pt-3 flex items-center justify-between gap-2 border-t border-stone-200/60 dark:border-stone-800/60">
                          <button
                            type="button"
                            disabled={clampedPage <= 0}
                            onClick={() => handlePageChange(clampedPage - 1)}
                            className="min-h-[40px] px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1 disabled:opacity-30 hover:bg-stone-200/40 dark:hover:bg-stone-800 transition-colors"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>上一頁</span>
                          </button>

                          <span className="text-xs tabular-nums text-stone-500">
                            {clampedPage + 1} / {textPages.length}
                          </span>

                          <button
                            type="button"
                            disabled={clampedPage >= textPages.length - 1}
                            onClick={() => handlePageChange(clampedPage + 1)}
                            className="min-h-[40px] px-3.5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-30 hover:opacity-90 transition-opacity"
                          >
                            <span>下一頁</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div
                    ref={proseRef}
                    style={proseComfortStyle}
                    className={`mt-6 selectable-text text-stone-800 dark:text-stone-200 font-ui reader-comfortable-prose ${
                      comfortConfig.comfortableSpacing ? 'is-comfort-active' : ''
                    }`}
                  >
                    <ChunkedReaderBody
                      content={work.content}
                      enabled={effectiveMarkdown}
                    />
                  </div>
                )
              )
            )}

            {/* Footer Metadata & Actions */}
            <div className="mt-10 pt-6 border-t border-stone-200/80 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-stone-500 dark:text-stone-400 space-y-1">
                {work.tags.length > 0 && (
                  <p>{work.tags.map((t) => `#${t}`).join('  ')}</p>
                )}
                <p className="tabular-nums">全文共 {charCount} 字</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!minimalMode && (
                  <button
                    type="button"
                    onClick={() => {
                      const snapshotWork = work;
                      const snapshotCols = [...collections];
                      const res = enqueueTask({
                        kind: 'pdf',
                        priority: 'high',
                        title: `單篇 PDF · ${snapshotWork.title}`,
                        run: async ({ onProgress, yieldAndRespectPriority }) => {
                          const pdf = await exportWorksAsPdfEbook([snapshotWork], snapshotCols, {
                            bookTitle: snapshotWork.title,
                            bookSubtitle: snapshotWork.subtitle || undefined,
                            authorName,
                            sealText,
                            pageSize: 'a5',
                            paperTone: 'ivory',
                            fontStyle: 'editorial',
                            includeCover: true,
                            includeToc: false,
                            onProgress,
                            yieldHook: yieldAndRespectPriority,
                          });
                          const kb = Math.max(1, Math.round(pdf.byteSize / 1024));
                          return `單篇 PDF「${snapshotWork.title}」匯出完成（${pdf.pageCount} 頁 · ${kb} KB），位置：${pdf.locationLabel}`;
                        },
                      });
                      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
                      setCopyToast({
                        text:
                          res.status === 'queued'
                            ? `已高優先插入佇列最前方（第 1 位）：${snapshotWork.title}`
                            : res.message,
                        isCopied: res.accepted,
                      });
                      toastTimerRef.current = window.setTimeout(() => setCopyToast(null), 2800);
                    }}
                    className="min-h-[44px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors inline-flex items-center gap-1.5"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>匯出 PDF</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onEdit(work)}
                  className="min-h-[44px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>編輯作品</span>
                </button>

                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="min-h-[44px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-[#9E3B33] dark:text-[#E07A70] hover:bg-[#9E3B33]/10 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>刪除</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        hasUserInteractedRef.current = false;
                        removeReadingProgressEntry(work.id);
                        onDelete(work);
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-[#9E3B33] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      確認刪除
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[44px] px-3 rounded-xl text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Floating Quick-Copy Action Bar when Text Selection is Active */}
        {!minimalMode && work.type === 'writing' && selectedText && !copyToast && (
          <div
            className="fixed left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
            style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void handleCopySelection()}
              className="min-h-[42px] px-4 rounded-full bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium shadow-xl inline-flex items-center gap-2 hover:opacity-95 transition-opacity whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{conciseCopyMode ? '複製選取段落' : '複製選取段落以用於圖卡'}</span>
            </button>
          </div>
        )}

        {/* Clipboard Toast Notification */}
        <AnimatePresence>
          {copyToast && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.16 }}
              className="fixed left-1/2 -translate-x-1/2 z-50 max-w-[90vw]"
              style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div
                className={`px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium inline-flex items-center gap-2 border ${
                  copyToast.isCopied
                    ? 'bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 border-transparent'
                    : 'bg-white dark:bg-[#1E1E1C] text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                }`}
              >
                {copyToast.isCopied && <Check className="w-3.5 h-3.5 shrink-0" />}
                <span>{copyToast.text}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};
