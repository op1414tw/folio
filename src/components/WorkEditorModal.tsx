import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Camera,
  ChevronDown,
  ChevronUp,
  Feather,
  ImagePlus,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { extractPhotoExif } from '../services/exif';
import { hasMarkdownSyntax, MarkdownText } from '../services/markdown';
import { readImageFileAsDataUrl } from '../services/storage';
import { Collection, NovelChapter, PhotoMeta, WorkItem, WorkType } from '../types';
import { BottomSheet } from './BottomSheet';
import { SlidingPill } from './SlidingPill';
import { SmoothCollapse } from './SmoothCollapse';

interface WorkEditorModalProps {
  isOpen: boolean;
  editingWork: WorkItem | null;
  collections: Collection[];
  defaultCollectionId?: string;
  defaultNewWorkType?: WorkType;
  defaultUntitledTitle?: string;
  defaultMarkdownEnabled?: boolean;
  conciseCopyMode?: boolean;
  minimalMode?: boolean;
  presetTags: string[];
  customTags: string[];
  hasPin: boolean;
  onClose: () => void;
  onSave: (work: WorkItem) => Promise<void>;
  onAddCustomTag: (tag: string) => Promise<void>;
  onRemoveCustomTag: (tag: string) => Promise<void>;
  onAddCollectionCategory: (collectionId: string, category: string) => Promise<void>;
  onRequestSetupPin: () => void;
}

export interface GenreItemMeta {
  id: string;
  name: string;
  sub: string;
  desc: string;
}

export const GENRE_ITEMS: GenreItemMeta[] = [
  { id: '現代詩', name: '現代詩', sub: '抒情', desc: '凝練意象 · 分行抒懷' },
  { id: '散文隨筆', name: '散文隨筆', sub: '感懷', desc: '行雲流水 · 寄情詠物' },
  { id: '手記', name: '手記', sub: '隨錄', desc: '日常手記 · 時光隨錄' },
  { id: '短篇小說', name: '短篇小說', sub: '敘事', desc: '獨立篇章 · 凝縮情節' },
  { id: '章節小說', name: '章節小說', sub: '分章', desc: '長篇連載 · 卷宗目錄' },
  { id: '閱讀摘錄', name: '閱讀摘錄', sub: '擷華', desc: '格言名句 · 書摘筆記' },
];

const GENRE_OPTIONS = GENRE_ITEMS.map((g) => g.id);

const DRAFT_STORAGE_PREFIX = 'folio_work_editor_draft_';
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const DRAFT_MAX_ENTRIES = 10;
const DRAFT_MAX_IMAGE_CHARS = 220_000;

export function removeWorkDraft(workId: string): void {
  try {
    localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${workId}`);
  } catch {
    // Ignore storage access errors
  }
}

export function clearAllWorkDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_STORAGE_PREFIX)) {
        keys.push(k);
      }
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore storage access errors
  }
}

function pruneStaleDrafts(excludeKey?: string): void {
  try {
    const now = Date.now();
    const validEntries: { key: string; savedAt: number }[] = [];
    const keysToCheck: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_STORAGE_PREFIX)) {
        keysToCheck.push(k);
      }
    }

    for (const k of keysToCheck) {
      if (k === excludeKey) continue;
      const raw = localStorage.getItem(k);
      if (!raw) {
        localStorage.removeItem(k);
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<WorkDraftRecord>;
        const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
        if (!savedAt || now - savedAt > DRAFT_MAX_AGE_MS) {
          localStorage.removeItem(k);
        } else {
          validEntries.push({ key: k, savedAt });
        }
      } catch {
        localStorage.removeItem(k);
      }
    }

    if (validEntries.length > DRAFT_MAX_ENTRIES) {
      validEntries.sort((a, b) => b.savedAt - a.savedAt);
      validEntries.slice(DRAFT_MAX_ENTRIES).forEach((entry) => {
        localStorage.removeItem(entry.key);
      });
    }
  } catch {
    // Ignore storage access errors
  }
}

interface WorkDraftRecord {
  savedAt: number;
  workId: string | null;
  type: WorkType;
  title: string;
  subtitle: string;
  content: string;
  writingGenre: string;
  chapters: NovelChapter[];
  collectionId: string;
  category: string;
  tags: string[];
  useMarkdown: boolean;
  photoMeta?: PhotoMeta;
  imageData?: string;
  aspectRatio?: number;
}

function createEmptyChapter(index: number, initialContent = ''): NovelChapter {
  return {
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: `第 ${index} 章`,
    content: initialContent,
  };
}

export const WorkEditorModal: React.FC<WorkEditorModalProps> = ({
  isOpen,
  editingWork,
  collections,
  defaultCollectionId,
  defaultNewWorkType = 'photography',
  defaultUntitledTitle = '無題',
  defaultMarkdownEnabled = true,
  conciseCopyMode = false,
  minimalMode = false,
  presetTags,
  customTags,
  hasPin,
  onClose,
  onSave,
  onAddCustomTag,
  onRemoveCustomTag,
  onAddCollectionCategory,
  onRequestSetupPin,
}) => {
  const { animationOverhaul } = useMotionPreferences();
  const [type, setType] = useState<WorkType>(defaultNewWorkType);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [imageData, setImageData] = useState<string | undefined>(undefined);
  const [aspectRatio, setAspectRatio] = useState<number>(1.33);
  const [collectionId, setCollectionId] = useState('');
  const [category, setCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [confirmRemoveWorkTag, setConfirmRemoveWorkTag] = useState<string | null>(null);
  const [confirmRemoveCustomTag, setConfirmRemoveCustomTag] = useState<string | null>(null);
  const [writingGenre, setWritingGenre] = useState('現代詩');
  const [chapters, setChapters] = useState<NovelChapter[]>([createEmptyChapter(1)]);
  const [createdAt, setCreatedAt] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showExif, setShowExif] = useState(false);
  const [photoMeta, setPhotoMeta] = useState<PhotoMeta>({});
  const [exifNotice, setExifNotice] = useState('');
  const [useMarkdown, setUseMarkdown] = useState(false);
  const [userTouchedMarkdown, setUserTouchedMarkdown] = useState(false);
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const prevDetectedMarkdownRef = useRef(false);
  const wasOpenRef = useRef(false);
  const initializedWorkIdRef = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Autosave and Draft Restoration State
  const [availableDraft, setAvailableDraft] = useState<{
    record: WorkDraftRecord;
    formattedDate: string;
  } | null>(null);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      initializedWorkIdRef.current = null;
      return;
    }
    const targetId = editingWork?.id ?? '__new__';
    if (wasOpenRef.current && initializedWorkIdRef.current === targetId) {
      return;
    }
    wasOpenRef.current = true;
    initializedWorkIdRef.current = targetId;

    setError('');
    setExifNotice('');
    setSaving(false);
    setAddingCategory(false);
    setNewCategoryInput('');
    setTagInput('');
    setConfirmRemoveWorkTag(null);
    setConfirmRemoveCustomTag(null);
    setPreviewMarkdown(false);

    if (editingWork) {
      setType(editingWork.type);
      setTitle(editingWork.title);
      setSubtitle(editingWork.subtitle || '');
      setContent(editingWork.content || '');
      setImageData(editingWork.imageData);
      setAspectRatio(editingWork.aspectRatio || 1.33);
      setCollectionId(editingWork.collectionId ?? '');
      setCategory(editingWork.category || '');
      setTags(editingWork.tags || []);
      const genre = editingWork.writingGenre || '現代詩';
      setWritingGenre(genre);
      if (editingWork.chapters && editingWork.chapters.length > 0) {
        setChapters(editingWork.chapters);
      } else if (genre === '章節小說') {
        setChapters([createEmptyChapter(1, editingWork.content || '')]);
      } else {
        setChapters([createEmptyChapter(1)]);
      }
      setCreatedAt(editingWork.createdAt);
      setFavorite(editingWork.favorite);
      setIsPrivate(editingWork.isPrivate);
      setPhotoMeta(editingWork.photoMeta || {});
      setShowExif(
        Boolean(editingWork.photoMeta && Object.values(editingWork.photoMeta).some(Boolean))
      );
      const initialHasMd =
        editingWork.type === 'writing' && editingWork.writingGenre === '章節小說'
          ? (editingWork.chapters || []).some((ch) => hasMarkdownSyntax(ch.content))
          : hasMarkdownSyntax(editingWork.content || '');
      prevDetectedMarkdownRef.current = initialHasMd;
      const resolvedInitialMd =
        editingWork.useMarkdown !== undefined
          ? Boolean(editingWork.useMarkdown)
          : defaultMarkdownEnabled;
      setUseMarkdown(initialHasMd ? resolvedInitialMd : false);
      setUserTouchedMarkdown(initialHasMd && editingWork.useMarkdown !== undefined);
    } else {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(today.getDate()).padStart(2, '0')}`;
      setType(defaultNewWorkType);
      setTitle('');
      setSubtitle('');
      setContent('');
      setImageData(undefined);
      setAspectRatio(1.33);
      const initialCol =
        defaultCollectionId && collections.some((c) => c.id === defaultCollectionId)
          ? defaultCollectionId
          : '';
      setCollectionId(initialCol);
      setCategory('');
      setTags([]);
      setWritingGenre('現代詩');
      setChapters([createEmptyChapter(1)]);
      setCreatedAt(dateStr);
      setFavorite(false);
      setIsPrivate(false);
      setPhotoMeta({});
      setShowExif(false);
      prevDetectedMarkdownRef.current = false;
      setUseMarkdown(false);
      setUserTouchedMarkdown(false);
    }

    // Prune expired/excess drafts and skip plaintext draft persistence for private works
    const draftKey = `${DRAFT_STORAGE_PREFIX}${editingWork?.id || 'new'}`;
    pruneStaleDrafts(draftKey);
    if (editingWork?.isPrivate) {
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      setAvailableDraft(null);
      return;
    }
    try {
      const rawDraft = localStorage.getItem(draftKey);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as WorkDraftRecord;
        const hasDraftContent =
          Boolean(parsed.title?.trim()) ||
          Boolean(parsed.content?.trim()) ||
          Boolean(parsed.imageData) ||
          (parsed.chapters && parsed.chapters.some((c) => c.content?.trim()));

        const chaptersChanged = editingWork
          ? JSON.stringify(parsed.chapters || []) !==
            JSON.stringify(editingWork.chapters || [])
          : false;

        const isDifferent = editingWork
          ? parsed.title !== editingWork.title ||
            parsed.content !== editingWork.content ||
            parsed.subtitle !== (editingWork.subtitle || '') ||
            (editingWork.writingGenre === '章節小說' && chaptersChanged)
          : hasDraftContent;

        if (hasDraftContent && isDifferent) {
          const date = new Date(parsed.savedAt);
          const formatted = `${date.getMonth() + 1}/${date.getDate()} ${String(
            date.getHours()
          ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          setAvailableDraft({ record: parsed, formattedDate: formatted });
        } else {
          setAvailableDraft(null);
        }
      } else {
        setAvailableDraft(null);
      }
    } catch {
      setAvailableDraft(null);
    }
  }, [
    isOpen,
    editingWork,
    collections,
    defaultCollectionId,
    defaultNewWorkType,
    defaultMarkdownEnabled,
  ]);

  // Debounced Autosave: automatically save draft 1.5s after editing stops (never for private works)
  useEffect(() => {
    if (!isOpen) return;

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (isPrivate || editingWork?.isPrivate) {
      const draftKey = `${DRAFT_STORAGE_PREFIX}${editingWork?.id || 'new'}`;
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      setLastAutosavedAt(null);
      return;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      const isChapterNovel = type === 'writing' && writingGenre === '章節小說';
      const hasMeaningfulContent =
        title.trim().length > 0 ||
        content.trim().length > 0 ||
        (isChapterNovel && chapters.some((c) => c.content.trim().length > 0)) ||
        (type === 'photography' && Boolean(imageData));

      if (!hasMeaningfulContent) return;

      const draftKey = `${DRAFT_STORAGE_PREFIX}${editingWork?.id || 'new'}`;
      const canStoreImage =
        type === 'photography' &&
        typeof imageData === 'string' &&
        imageData.length <= DRAFT_MAX_IMAGE_CHARS;

      const baseRecord: WorkDraftRecord = {
        savedAt: Date.now(),
        workId: editingWork?.id || null,
        type,
        title,
        subtitle,
        content,
        writingGenre,
        chapters,
        collectionId,
        category,
        tags,
        useMarkdown,
        photoMeta,
        imageData: canStoreImage ? imageData : undefined,
        aspectRatio: type === 'photography' ? aspectRatio : undefined,
      };

      const markSaved = () => {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}`;
        setLastAutosavedAt(`已於 ${timeStr} 自動暫存`);
      };

      try {
        localStorage.setItem(draftKey, JSON.stringify(baseRecord));
        markSaved();
      } catch {
        // Quota fallback: prune old drafts and retry without imageData so text edits are preserved
        pruneStaleDrafts(draftKey);
        try {
          const textOnlyRecord: WorkDraftRecord = { ...baseRecord, imageData: undefined };
          localStorage.setItem(draftKey, JSON.stringify(textOnlyRecord));
          markSaved();
        } catch {
          // Storage quota exhausted
        }
      }
    }, 1500);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    isOpen,
    isPrivate,
    editingWork?.isPrivate,
    type,
    title,
    subtitle,
    content,
    writingGenre,
    chapters,
    collectionId,
    category,
    tags,
    useMarkdown,
    photoMeta,
    imageData,
    aspectRatio,
    editingWork?.id,
  ]);

  const handleRestoreDraft = () => {
    if (!availableDraft) return;
    const { record } = availableDraft;
    setType(record.type);
    setTitle(record.title || '');
    setSubtitle(record.subtitle || '');
    setContent(record.content || '');
    setWritingGenre(record.writingGenre || '現代詩');
    if (record.chapters && record.chapters.length > 0) {
      setChapters(record.chapters);
    }
    setCollectionId(record.collectionId || '');
    setCategory(record.category || '');
    setTags(record.tags || []);
    setUseMarkdown(Boolean(record.useMarkdown));
    if (record.photoMeta) {
      setPhotoMeta(record.photoMeta);
      setShowExif(Object.values(record.photoMeta).some(Boolean));
    }
    if (record.imageData) setImageData(record.imageData);
    if (record.aspectRatio) setAspectRatio(record.aspectRatio);
    setAvailableDraft(null);
    setLastAutosavedAt('已成功還原草稿');
  };

  const handleDiscardDraft = () => {
    const draftKey = `${DRAFT_STORAGE_PREFIX}${editingWork?.id || 'new'}`;
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setAvailableDraft(null);
    setLastAutosavedAt(null);
  };

  const detectedMarkdown = useMemo(() => {
    if (type === 'writing' && writingGenre === '章節小說') {
      return chapters.some((ch) => hasMarkdownSyntax(ch.content));
    }
    return hasMarkdownSyntax(content);
  }, [type, writingGenre, chapters, content]);

  useEffect(() => {
    if (!isOpen) return;
    if (!detectedMarkdown) {
      prevDetectedMarkdownRef.current = false;
      setUseMarkdown(false);
      return;
    }
    if (!prevDetectedMarkdownRef.current) {
      prevDetectedMarkdownRef.current = true;
      if (!userTouchedMarkdown) {
        setUseMarkdown(defaultMarkdownEnabled);
      }
    }
  }, [detectedMarkdown, isOpen, userTouchedMarkdown, defaultMarkdownEnabled]);

  const activeCollection = useMemo(
    () => (collectionId ? collections.find((c) => c.id === collectionId) : undefined),
    [collections, collectionId]
  );
  const availableCategories = useMemo(() => {
    const base = activeCollection?.categories || [];
    if (category && activeCollection && !base.includes(category)) {
      return [...base, category];
    }
    return base;
  }, [activeCollection, category]);

  const handleCollectionChange = (nextColId: string) => {
    setCollectionId(nextColId);
    if (!nextColId) {
      setCategory('');
      setAddingCategory(false);
      return;
    }
    const nextCol = collections.find((c) => c.id === nextColId);
    if (!nextCol?.categories?.includes(category)) {
      setCategory('');
    }
  };

  const handleSelectGenre = (nextGenre: string) => {
    if (nextGenre === '章節小說' && writingGenre !== '章節小說') {
      const hasChapterText = chapters.some((ch) => ch.content.trim().length > 0);
      if (!hasChapterText && content.trim()) {
        setChapters([createEmptyChapter(1, content)]);
      }
    } else if (nextGenre !== '章節小說' && writingGenre === '章節小說') {
      if (!content.trim() && chapters.some((ch) => ch.content.trim())) {
        setContent(
          chapters
            .filter((ch) => ch.content.trim())
            .map((ch) => `${ch.title}\n\n${ch.content}`)
            .join('\n\n')
        );
      }
    }
    setWritingGenre(nextGenre);
  };

  const handleUpdateChapter = (id: string, patch: Partial<NovelChapter>) => {
    setChapters((prev) => prev.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch)));
  };

  const handleAddChapter = () => {
    setChapters((prev) => [...prev, createEmptyChapter(prev.length + 1)]);
  };

  const handleRemoveChapter = (id: string) => {
    setChapters((prev) => (prev.length > 1 ? prev.filter((ch) => ch.id !== id) : prev));
  };

  const handleMoveChapter = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= chapters.length) return;
    setChapters((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleCreateInlineCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed || !collectionId) return;
    await onAddCollectionCategory(collectionId, trimmed);
    setCategory(trimmed);
    setNewCategoryInput('');
    setAddingCategory(false);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddTag = async (saveAsFavoriteTag: boolean) => {
    const cleaned = tagInput.trim().replace(/^#+/, '');
    if (!cleaned) return;
    if (!tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    if (saveAsFavoriteTag) {
      await onAddCustomTag(cleaned);
    }
    setTagInput('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setExifNotice('');
    try {
      const [res, exif] = await Promise.all([
        readImageFileAsDataUrl(file),
        extractPhotoExif(file),
      ]);
      setImageData(res.dataUrl);
      setAspectRatio(res.aspectRatio);
      if (!title.trim()) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setTitle(nameWithoutExt);
      }
      if (exif.hasData) {
        setPhotoMeta((prev) => ({
          ...prev,
          ...exif.meta,
        }));
        if (exif.dateStr) {
          setCreatedAt(exif.dateStr);
        }
        setShowExif(true);
        setExifNotice(
          exif.summary
            ? `已自動讀取 EXIF：${exif.summary}`
            : `已自動讀取拍攝日期：${exif.dateStr}`
        );
      } else {
        setExifNotice('此相片未內含相機 EXIF 資訊，可於下方手動填寫器材筆記。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '圖片讀取失敗');
    } finally {
      e.target.value = '';
    }
  };

  const handleTogglePrivate = () => {
    if (!isPrivate && !hasPin) {
      setError('請先設定 4 位數隱私密碼，才能啟用作品加密鎖定。');
      onRequestSetupPin();
      return;
    }
    setIsPrivate((v) => {
      const next = !v;
      if (next) {
        const draftKey = `${DRAFT_STORAGE_PREFIX}${editingWork?.id || 'new'}`;
        try {
          localStorage.removeItem(draftKey);
        } catch {}
        setAvailableDraft(null);
        setLastAutosavedAt(null);
      }
      return next;
    });
  };

  const resolvedUntitledTitle = defaultUntitledTitle.trim() || '無題';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalTitle = title.trim() || resolvedUntitledTitle;
    const isChapterNovel = type === 'writing' && writingGenre === '章節小說';
    let normalizedChapters: NovelChapter[] | undefined;
    let finalContent = content.trim();

    if (type === 'photography' && !imageData) {
      setError('請選擇一張攝影作品照片');
      return;
    }

    if (type === 'writing') {
      if (isChapterNovel) {
        const filled = chapters.filter((ch) => ch.content.trim().length > 0);
        if (filled.length === 0) {
          setError('請至少撰寫一個章節的內容');
          return;
        }
        normalizedChapters = filled.map((ch, idx) => ({
          id: ch.id,
          title: ch.title.trim() || `第 ${idx + 1} 章`,
          content: ch.content.trim(),
        }));
        finalContent = normalizedChapters
          .map((ch) => `${ch.title}\n${ch.content}`)
          .join('\n\n');
      } else if (!finalContent) {
        setError('請輸入文字內容');
        return;
      }
    }

    const item: WorkItem = {
      id: editingWork?.id || `work_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: finalTitle,
      subtitle: subtitle.trim() || undefined,
      content: finalContent,
      imageData: type === 'photography' ? imageData : undefined,
      aspectRatio: type === 'photography' ? aspectRatio : undefined,
      collectionId: collectionId,
      category: collectionId ? category.trim() || undefined : undefined,
      tags: Array.from(new Set(tags)),
      favorite,
      isPrivate,
      isSealed: false,
      photoMeta: type === 'photography' ? photoMeta : undefined,
      writingGenre: type === 'writing' ? writingGenre : undefined,
      chapters: isChapterNovel ? normalizedChapters : undefined,
      useMarkdown: detectedMarkdown ? useMarkdown : false,
      createdAt: createdAt || new Date().toISOString().slice(0, 10),
      updatedAt: Date.now(),
    };

    setSaving(true);
    try {
      await onSave(item);
      const draftKey = `${DRAFT_STORAGE_PREFIX}${editingWork?.id || 'new'}`;
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      setLastAutosavedAt(null);
      setAvailableDraft(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  const charCount =
    type === 'writing' && writingGenre === '章節小說'
      ? chapters.reduce((sum, ch) => sum + ch.content.replace(/\s+/g, '').length, 0)
      : content.replace(/\s+/g, '').length;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      zIndexClass="z-[60]"
      maxWidthClass="sm:max-w-2xl"
      panelClassName="max-h-[92vh] bg-[#F7F6F2] dark:bg-[#171716] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
    >
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <h2 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
                  {editingWork ? '編輯典藏作品' : '收錄新作品'}
                </h2>
                {lastAutosavedAt && (
                  <span className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums hidden sm:inline">
                    · {lastAutosavedAt}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉編輯器"
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-full text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5">
              {/* Draft Restoration Banner */}
              {availableDraft && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      發現於 <strong>{availableDraft.formattedDate}</strong> 自動儲存的未儲存草稿，是否恢復？
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={handleRestoreDraft}
                      className="px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium transition-colors"
                    >
                      還原草稿
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardDraft}
                      className="px-2.5 py-1 rounded-lg text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-300 transition-colors"
                    >
                      捨棄
                    </button>
                  </div>
                </div>
              )}
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#EFECE6] dark:bg-[#222220] rounded-xl">
                <button
                  type="button"
                  onClick={() => setType('photography')}
                  className={`relative min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    type === 'photography'
                      ? 'text-stone-900 dark:text-stone-100'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800'
                  }`}
                >
                  {type === 'photography' && (
                    <SlidingPill
                      layoutId="editor-type-pill"
                      className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                    />
                  )}
                  <Camera className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">攝影作品</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('writing')}
                  className={`relative min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    type === 'writing'
                      ? 'text-stone-900 dark:text-stone-100'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800'
                  }`}
                >
                  {type === 'writing' && (
                    <SlidingPill
                      layoutId="editor-type-pill"
                      className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                    />
                  )}
                  <Feather className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">文字創作</span>
                </button>
              </div>

              {/* Photo Picker (Gallery + Camera with Auto EXIF Extraction) */}
              <SmoothCollapse
                open={type === 'photography'}
                animate={animationOverhaul}
                unmountOnClose={false}
                innerClassName="space-y-2.5"
              >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {imageData ? (
                    <div className="relative rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900">
                      <img
                        src={imageData}
                        alt="預覽作品"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-72 object-contain mx-auto"
                      />
                      <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-black/70 text-white text-xs font-medium hover:bg-black/85 transition-colors"
                        >
                          更換相片
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-8 px-4 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-[#1E1E1C] hover:bg-white dark:hover:bg-[#232321] transition-colors flex flex-col items-center justify-center gap-1.5 text-stone-500 dark:text-stone-400"
                    >
                      <ImagePlus className="w-6 h-6 stroke-[1.5]" />
                      <span className="text-sm font-medium text-stone-700 dark:text-stone-200">
                        從裝置相簿讀取
                      </span>
                      {!conciseCopyMode && (
                        <span className="text-[11px] text-stone-400">
                          自動提取相機型號、焦段與拍攝參數
                        </span>
                      )}
                    </button>
                  )}

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 inline-flex items-center gap-1 py-0.5 transition-colors"
                    >
                      <Camera className="w-3 h-3" />
                      <span>改以相機拍攝</span>
                    </button>
                  </div>

                  {!minimalMode && exifNotice && (
                    <p className="text-xs text-[#284152] dark:text-stone-300 bg-[#EFECE6] dark:bg-[#222220] px-3.5 py-2 rounded-xl flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>{exifNotice}</span>
                    </p>
                  )}
              </SmoothCollapse>

              {/* Title & Subtitle */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    {conciseCopyMode
                      ? `標題（留空為「${resolvedUntitledTitle}」）`
                      : `作品標題（留空將自動命名為「${resolvedUntitledTitle}」）`}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      conciseCopyMode
                        ? `留空則為「${resolvedUntitledTitle}」`
                        : type === 'photography'
                        ? `留空將自動命名為「${resolvedUntitledTitle}」（例如：藍調時刻的雨窗）`
                        : `留空將自動命名為「${resolvedUntitledTitle}」（例如：給十月海霧的備忘錄）`
                    }
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#284152]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    {conciseCopyMode ? '副標題（選填）' : '副標題或引句（選填）'}
                  </label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder={conciseCopyMode ? '選填副標題...' : '一句簡短的註解、英文題名或靈感來源'}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#284152]/30"
                  />
                </div>
              </div>

              {/* Writing Genre */}
              <SmoothCollapse
                open={type === 'writing'}
                animate={animationOverhaul}
                unmountOnClose={false}
                innerClassName="space-y-2"
              >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
                      文體分類
                    </label>
                    <span className="text-[11px] text-stone-400 dark:text-stone-500">
                      當前：<span className="font-medium text-stone-700 dark:text-stone-300">{writingGenre}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                    {GENRE_ITEMS.map((g) => {
                      const isSelected = writingGenre === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => handleSelectGenre(g.id)}
                          className={`group relative p-2.5 sm:p-3 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between ${
                            conciseCopyMode ? 'min-h-[44px]' : 'min-h-[58px] sm:min-h-[64px]'
                          } active:scale-[0.98] ${
                            isSelected
                              ? 'bg-[#284152] dark:bg-[#E7E5E0] border-transparent text-white dark:text-stone-900 shadow-sm ring-2 ring-[#284152]/20 dark:ring-white/20'
                              : 'bg-white dark:bg-[#222220] border-stone-200/90 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-600 hover:bg-stone-50 dark:hover:bg-[#272725]'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-editorial text-xs sm:text-sm font-semibold tracking-wide">
                              {g.name}
                            </span>
                            {!conciseCopyMode && (
                              <span
                                className={`text-[9px] px-1 py-0.5 rounded font-mono uppercase tracking-wider shrink-0 ${
                                  isSelected
                                    ? 'bg-white/20 dark:bg-stone-900/20 text-white dark:text-stone-900'
                                    : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 group-hover:text-stone-600 dark:group-hover:text-stone-300'
                                }`}
                              >
                                {g.sub}
                              </span>
                            )}
                          </div>
                          {!conciseCopyMode && (
                            <span
                              className={`text-[10px] sm:text-[11px] mt-1 truncate ${
                                isSelected
                                  ? 'text-white/80 dark:text-stone-800/80 font-normal'
                                  : 'text-stone-400 dark:text-stone-500'
                              }`}
                            >
                              {g.desc}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
              </SmoothCollapse>

              {/* Content / Story OR Multi-chapter Editor */}
              {type === 'writing' && writingGenre === '章節小說' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
                      小說章節分段（共 {chapters.length} 章）
                    </label>
                    <span className="text-xs tabular-nums text-stone-400">
                      總計 {charCount} 字
                    </span>
                  </div>

                  <div className="space-y-3">
                    {chapters.map((ch, idx) => {
                      const chWords = ch.content.replace(/\s+/g, '').length;
                      return (
                        <div
                          key={ch.id}
                          className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 space-y-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-stone-400 tabular-nums shrink-0">
                              #{idx + 1}
                            </span>
                            <input
                              type="text"
                              value={ch.title}
                              onChange={(e) =>
                                handleUpdateChapter(ch.id, { title: e.target.value })
                              }
                              placeholder={`第 ${idx + 1} 章標題（可自由取名）`}
                              className="flex-1 min-w-0 min-h-[38px] px-3 rounded-lg bg-[#F7F6F2] dark:bg-[#252523] border border-stone-200/80 dark:border-stone-700 text-sm font-medium text-stone-900 dark:text-stone-100 focus:outline-none"
                            />
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveChapter(idx, -1)}
                                aria-label="上移章節"
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === chapters.length - 1}
                                onClick={() => handleMoveChapter(idx, 1)}
                                aria-label="下移章節"
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              {chapters.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveChapter(ch.id)}
                                  aria-label="刪除此章節"
                                  className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-stone-400 hover:text-[#9E3B33]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <textarea
                            rows={6}
                            value={ch.content}
                            onChange={(e) =>
                              handleUpdateChapter(ch.id, { content: e.target.value })
                            }
                            placeholder={`撰寫「${ch.title || `第 ${idx + 1} 章`}」的正文內容...`}
                            className="w-full px-3 py-2.5 rounded-xl bg-[#F7F6F2] dark:bg-[#252523] border border-stone-200/80 dark:border-stone-700 text-sm leading-relaxed text-stone-900 dark:text-stone-100 focus:outline-none resize-y"
                          />

                          <div className="text-right text-[11px] tabular-nums text-stone-400">
                            本章 {chWords} 字
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddChapter}
                    className="w-full min-h-[42px] rounded-xl border border-dashed border-stone-300 dark:border-stone-700 text-xs font-medium text-[#284152] dark:text-stone-300 hover:bg-white dark:hover:bg-[#1E1E1C] transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增章節</span>
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
                      {type === 'photography'
                        ? conciseCopyMode
                          ? '影像筆記（選填）'
                          : '影像背後的筆記與故事（選填）'
                        : '正文內容'}
                    </label>
                    <span className="text-xs tabular-nums text-stone-400">{charCount} 字</span>
                  </div>
                  <textarea
                    rows={type === 'writing' ? 8 : 3}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={
                      conciseCopyMode
                        ? type === 'photography'
                          ? '影像筆記（選填）...'
                          : '撰寫內容...'
                        : type === 'photography'
                        ? '記錄按下快門那刻的光線、氣味與心情...'
                        : '寫下你的詩句、散文或深夜隨筆...'
                    }
                    className="w-full px-3.5 py-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm leading-relaxed text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#284152]/30 resize-y"
                  />
                </div>
              )}

              {/* Conditional Markdown Syntax Detection Prompt (Hidden when no Markdown detected or in Minimal Mode) */}
              {!minimalMode && detectedMarkdown && (
                <div className="p-4 rounded-xl bg-[#EFECE6]/85 dark:bg-[#222220] border border-stone-200/90 dark:border-stone-700/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                        偵測到內文含簡易 Markdown 語法
                      </div>
                      {!conciseCopyMode && (
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                          支援 **粗體**、*斜體*、~~刪除線~~、# 標題與 &gt; 引言，是否於閱讀模式套用排版效果？
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {useMarkdown && (
                        <button
                          type="button"
                          onClick={() => setPreviewMarkdown((p) => !p)}
                          className="min-h-[38px] px-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#191918] text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800"
                        >
                          {previewMarkdown ? '收合預覽' : '預覽排版'}
                        </button>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={useMarkdown}
                        onClick={() => {
                          setUserTouchedMarkdown(true);
                          setUseMarkdown((v) => !v);
                        }}
                        className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium shrink-0 border transition-colors ${
                          useMarkdown
                            ? 'bg-[#284152] dark:bg-[#E7E5E0] border-transparent text-white dark:text-stone-900'
                            : 'bg-white dark:bg-[#191918] border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                        }`}
                      >
                        {useMarkdown ? '已套用 Markdown' : '保持純文字'}
                      </button>
                    </div>
                  </div>

                  {useMarkdown && previewMarkdown && (
                    <div className="p-3.5 rounded-xl bg-white dark:bg-[#171716] border border-stone-200/80 dark:border-stone-800 text-sm leading-relaxed text-stone-800 dark:text-stone-200 max-h-52 overflow-y-auto">
                      <MarkdownText
                        content={
                          type === 'writing' && writingGenre === '章節小說'
                            ? chapters
                                .filter((ch) => ch.content.trim())
                                .map((ch) => `## ${ch.title}\n${ch.content}`)
                                .join('\n\n')
                            : content
                        }
                        enabled
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Collapsible EXIF fields for photography (hidden in Minimal Mode) */}
              {!minimalMode && type === 'photography' && (
                <div className="rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1E1E1C] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowExif((s) => !s)}
                    className="w-full min-h-[44px] px-4 flex items-center justify-between text-xs font-medium text-stone-700 dark:text-stone-300"
                  >
                    <span>攝影器材與拍攝參數（EXIF 筆記）</span>
                    {showExif ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {showExif && (
                    <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-stone-100 dark:border-stone-800">
                      <input
                        type="text"
                        placeholder="相機 (如 Leica M6)"
                        value={photoMeta.camera || ''}
                        onChange={(e) =>
                          setPhotoMeta({ ...photoMeta, camera: e.target.value })
                        }
                        className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#252523] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                      />
                      <input
                        type="text"
                        placeholder="鏡頭 / 焦段 (如 35mm)"
                        value={photoMeta.lens || ''}
                        onChange={(e) => setPhotoMeta({ ...photoMeta, lens: e.target.value })}
                        className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#252523] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                      />
                      <input
                        type="text"
                        placeholder="底片 / 色調"
                        value={photoMeta.film || ''}
                        onChange={(e) => setPhotoMeta({ ...photoMeta, film: e.target.value })}
                        className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#252523] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                      />
                      <input
                        type="text"
                        placeholder="光圈 (如 f/2.8)"
                        value={photoMeta.aperture || ''}
                        onChange={(e) =>
                          setPhotoMeta({ ...photoMeta, aperture: e.target.value })
                        }
                        className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#252523] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                      />
                      <input
                        type="text"
                        placeholder="快門 (如 1/125s)"
                        value={photoMeta.shutter || ''}
                        onChange={(e) =>
                          setPhotoMeta({ ...photoMeta, shutter: e.target.value })
                        }
                        className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#252523] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                      />
                      <input
                        type="text"
                        placeholder="ISO (如 400)"
                        value={photoMeta.iso || ''}
                        onChange={(e) => setPhotoMeta({ ...photoMeta, iso: e.target.value })}
                        className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#252523] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                      />
                      <div className="col-span-2 sm:col-span-3 space-y-1.5">
                        <input
                          type="text"
                          placeholder="拍攝地點 (如 台北大稻埕、花蓮七星潭 或 座標 25.03, 121.54)"
                          value={photoMeta.location || ''}
                          onChange={(e) =>
                            setPhotoMeta({ ...photoMeta, location: e.target.value })
                          }
                          className="w-full min-h-[40px] px-3 rounded-lg bg-white dark:bg-[#252523] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100"
                        />
                        {/* Quick Geo Location Presets */}
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                          <span className="text-[10px] text-stone-400 shrink-0">常用地標：</span>
                          {[
                            { name: '台北 · 大稻埕', lat: 25.056, lng: 121.5097 },
                            { name: '花蓮 · 七星潭', lat: 24.0315, lng: 121.6294 },
                            { name: '台南 · 中西區', lat: 22.9926, lng: 120.1983 },
                            { name: '台中 · 高美', lat: 24.312, lng: 120.55 },
                            { name: '高雄 · 駁二', lat: 22.619, lng: 120.281 },
                            { name: '宜蘭 · 蘇澳', lat: 24.595, lng: 121.85 },
                            { name: '台東 · 池上', lat: 23.123, lng: 121.218 },
                          ].map((chip) => (
                            <button
                              key={chip.name}
                              type="button"
                              onClick={() =>
                                setPhotoMeta({
                                  ...photoMeta,
                                  location: chip.name,
                                  latitude: chip.lat,
                                  longitude: chip.lng,
                                })
                              }
                              className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-[10px] text-stone-600 dark:text-stone-300 transition-colors shrink-0"
                            >
                              {chip.name.split(' · ')[1] || chip.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Collection, Sub-category & Date */}
              <div className={`grid grid-cols-1 ${minimalMode ? '' : 'sm:grid-cols-3'} gap-3`}>
                {!minimalMode && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                        歸類作品集
                      </label>
                      <select
                        value={collectionId}
                        onChange={(e) => handleCollectionChange(e.target.value)}
                        className="w-full min-h-[44px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                      >
                        <option value="">不加入任何作品集</option>
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
                          作品集子分類
                        </label>
                        {collectionId && (
                          <button
                            type="button"
                            onClick={() => setAddingCategory((a) => !a)}
                            className="text-[11px] font-medium text-[#284152] dark:text-stone-300 hover:underline inline-flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" />
                            <span>新建</span>
                          </button>
                        )}
                      </div>
                      {!collectionId ? (
                        <select
                          disabled
                          value=""
                          className="w-full min-h-[44px] px-3 rounded-xl bg-stone-100/80 dark:bg-[#1C1C1A] border border-stone-200/70 dark:border-stone-800 text-sm text-stone-400 cursor-not-allowed"
                        >
                          <option value="">需先選擇作品集</option>
                        </select>
                      ) : addingCategory ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={newCategoryInput}
                            onChange={(e) => setNewCategoryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleCreateInlineCategory();
                              }
                            }}
                            placeholder="新子分類名稱"
                            className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-300 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleCreateInlineCategory()}
                            className="min-h-[44px] px-3 rounded-xl bg-[#284152] text-white text-xs font-medium shrink-0"
                          >
                            加入
                          </button>
                        </div>
                      ) : (
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full min-h-[44px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                        >
                          <option value="">不指定子分類</option>
                          {availableCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                    創作日期
                  </label>
                  <input
                    type="date"
                    value={createdAt}
                    onChange={(e) => setCreatedAt(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm tabular-nums text-stone-900 dark:text-stone-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Tags Picker (hidden in Minimal Mode) */}
              {!minimalMode && (
              <div className="p-4 rounded-2xl bg-white/70 dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                    作品標籤
                  </label>
                  <span className="text-[11px] tabular-nums text-stone-400">
                    已選 {tags.length} 個
                  </span>
                </div>

                {/* Selected Tags on this Work */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) =>
                      confirmRemoveWorkTag === t ? (
                        <div
                          key={t}
                          className="min-h-[32px] px-2 rounded-lg bg-[#9E3B33]/10 border border-[#9E3B33]/40 text-xs inline-flex items-center gap-1.5"
                        >
                          <span className="text-[#9E3B33] dark:text-[#E07A70] font-medium">
                            移除 #{t}？
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              toggleTag(t);
                              setConfirmRemoveWorkTag(null);
                            }}
                            className="px-2 py-0.5 rounded bg-[#9E3B33] text-white text-[11px] font-medium"
                          >
                            移除
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveWorkTag(null)}
                            className="px-1 py-0.5 text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setConfirmRemoveWorkTag(t)}
                          className="min-h-[32px] px-2.5 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1"
                        >
                          <span>#{t}</span>
                          <X className="w-3 h-3" />
                        </button>
                      )
                    )}
                  </div>
                )}

                {/* Custom Tag Input */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleAddTag(false);
                      }
                    }}
                    placeholder="輸入自訂標籤（例如：大稻埕）"
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleAddTag(false)}
                      className="min-h-[40px] px-3 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 whitespace-nowrap"
                    >
                      加入標籤
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddTag(true)}
                      className="min-h-[40px] px-3 rounded-xl bg-[#EFECE6] dark:bg-stone-800 text-xs font-medium text-[#284152] dark:text-stone-200 inline-flex items-center gap-1 hover:opacity-90 whitespace-nowrap"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>加入並存至常用</span>
                    </button>
                  </div>
                </div>

                {/* Saved Frequent Custom Tags */}
                {customTags.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                      常用自訂標籤
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {customTags.map((t) => {
                        const selected = tags.includes(t);
                        if (confirmRemoveCustomTag === t) {
                          return (
                            <div
                              key={t}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#9E3B33]/10 border border-[#9E3B33]/40 text-xs"
                            >
                              <span className="text-[#9E3B33] dark:text-[#E07A70] font-medium">
                                刪除常用 #{t}？
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  void onRemoveCustomTag(t);
                                  setConfirmRemoveCustomTag(null);
                                }}
                                className="px-2 py-0.5 rounded bg-[#9E3B33] text-white text-[11px] font-medium"
                              >
                                刪除
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveCustomTag(null)}
                                className="px-1 py-0.5 text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                              >
                                取消
                              </button>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={t}
                            className={`inline-flex items-center rounded-lg border overflow-hidden transition-colors ${
                              selected
                                ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-700 text-[#284152] dark:text-stone-100'
                                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#222220] text-stone-600 dark:text-stone-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (selected) {
                                  setConfirmRemoveWorkTag(t);
                                } else {
                                  toggleTag(t);
                                }
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium"
                            >
                              #{t}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveCustomTag(t)}
                              aria-label={`從常用標籤移除 ${t}`}
                              title="從常用移除"
                              className="pr-2 pl-0.5 py-1.5 text-stone-400 hover:text-[#9E3B33]"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Universal Preset Tags */}
                {presetTags.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                      通用預設標籤
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {presetTags.map((t) => {
                        const selected = tags.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              if (selected) {
                                setConfirmRemoveWorkTag(t);
                              } else {
                                toggleTag(t);
                              }
                            }}
                            className={`min-h-[32px] px-2.5 rounded-lg border text-xs transition-colors ${
                              selected
                                ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-700 text-[#284152] dark:text-stone-100 font-medium'
                                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#222220] text-stone-600 dark:text-stone-400 hover:text-stone-900'
                            }`}
                          >
                            #{t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {!minimalMode && (
                  <button
                    type="button"
                    onClick={() => setFavorite((f) => !f)}
                    className={`min-h-[44px] px-4 rounded-xl border text-xs font-medium transition-colors ${
                      favorite
                        ? 'border-[#9E3B33]/40 bg-[#9E3B33]/10 text-[#9E3B33] dark:text-[#E07A70]'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#222220] text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {favorite ? '★ 已加入精選收藏' : '☆ 加入精選收藏'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleTogglePrivate}
                  className={`min-h-[44px] px-4 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    isPrivate
                      ? 'border-[#284152]/40 bg-[#284152]/10 dark:bg-stone-700 text-[#284152] dark:text-stone-100'
                      : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#222220] text-stone-600 dark:text-stone-300'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isPrivate ? '已設為私密加密' : '設為私密作品'}</span>
                </button>
              </div>

              {error && (
                <p className="text-xs font-medium text-[#9E3B33] dark:text-[#E07A70] bg-[#9E3B33]/10 px-3.5 py-2.5 rounded-xl">
                  {error}
                </p>
              )}

              {/* Footer Submit */}
              <div className="pt-2 pb-safe flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 rounded-xl text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-6 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? '儲存中...' : editingWork ? '儲存變更' : '收錄至卷宗'}
                </button>
              </div>
            </form>
    </BottomSheet>
  );
};
