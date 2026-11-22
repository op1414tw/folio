import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpToLine,
  BookOpen,
  Check,
  Edit2,
  FolderPlus,
  FolderTree,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  Collection,
  CollectionBannerConfig,
  CollectionBannerMode,
  WorkItem,
} from '../types';
import { BottomSheet } from './BottomSheet';

function getLocalDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickDailyIndex(collectionId: string, length: number): number {
  if (length <= 1) return 0;
  const seed = `${getLocalDateKey()}:${collectionId}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function resolveBannerImage(
  colId: string,
  banner: CollectionBannerConfig | undefined,
  colWorks: WorkItem[]
): { src: string | undefined; zoom: number; posX: number; posY: number; mode: CollectionBannerMode } {
  const mode: CollectionBannerMode = banner?.mode || 'auto-first';
  const eligiblePhotos = colWorks.filter(
    (w) => w.type === 'photography' && Boolean(w.imageData) && !w.isSealed
  );

  let src: string | undefined;
  if (mode === 'custom-upload') {
    src = banner?.customImageData || eligiblePhotos[0]?.imageData;
  } else if (mode === 'work-photo') {
    src =
      eligiblePhotos.find((w) => w.id === banner?.workId)?.imageData ||
      eligiblePhotos[0]?.imageData;
  } else if (mode === 'auto-daily') {
    if (eligiblePhotos.length > 0) {
      const idx = pickDailyIndex(colId, eligiblePhotos.length);
      src = eligiblePhotos[idx]?.imageData;
    }
  } else {
    src = eligiblePhotos[0]?.imageData;
  }

  const zoom = Math.min(2.5, Math.max(1, banner?.zoom ?? 1));
  const offsetX = Math.min(100, Math.max(-100, banner?.offsetX ?? 0));
  const offsetY = Math.min(100, Math.max(-100, banner?.offsetY ?? 0));
  const posX = (offsetX + 100) / 2;
  const posY = (offsetY + 100) / 2;

  return { src, zoom, posX, posY, mode };
}

function compressBannerImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('無法讀取選擇的圖片檔案。'));
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('圖片內容空白，請重新選擇。'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('不支援的圖片格式或檔案已損毀。'));
      img.onload = () => {
        const maxW = 1400;
        const maxH = 900;
        const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const out = canvas.toDataURL('image/jpeg', 0.86);
          resolve(out);
        } catch {
          resolve(rawUrl);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

interface CollectionsManagerProps {
  collections: Collection[];
  works: WorkItem[];
  onCreateCollection: (name: string, description: string) => Promise<void>;
  onUpdateCollection: (col: Collection) => Promise<void>;
  onReorderCollections: (ordered: Collection[]) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onAddCategory: (collectionId: string, category: string) => Promise<void>;
  onDeleteCategory: (collectionId: string, category: string) => Promise<void>;
  onOpenCollection: (id: string, category?: string) => void;
  onAddWorkInCollection: (id: string) => void;
  onExportCollectionPdf: (id: string) => void;
  onOpenBatchExplorer: () => void;
  conciseCopyMode?: boolean;
}

export const CollectionsManager: React.FC<CollectionsManagerProps> = ({
  collections,
  works,
  onCreateCollection,
  onUpdateCollection,
  onReorderCollections,
  onDeleteCollection,
  onAddCategory,
  onDeleteCategory,
  onOpenCollection,
  onAddWorkInCollection,
  onExportCollectionPdf,
  onOpenBatchExplorer,
  conciseCopyMode = false,
}) => {
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addingCatForId, setAddingCatForId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');

  // Banner customization modal state
  const [bannerColId, setBannerColId] = useState<string | null>(null);
  const [bannerDraft, setBannerDraft] = useState<CollectionBannerConfig>({
    mode: 'auto-first',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [isBannerDragging, setIsBannerDragging] = useState(false);
  const bannerCropRef = useRef<HTMLDivElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerDragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    origOffsetX: 0,
    origOffsetY: 0,
  });

  // Pointer-based drag-and-drop sorting state (works on both Android touch & desktop mouse)
  const [orderedCols, setOrderedCols] = useState<Collection[]>(collections);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderedColsRef = useRef<Collection[]>(collections);
  const draggingIdRef = useRef<string | null>(null);
  const initialOrderIdsRef = useRef<string[]>([]);
  const lastSwapAtRef = useRef<number>(0);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!draggingIdRef.current) {
      setOrderedCols(collections);
      orderedColsRef.current = collections;
    }
  }, [collections]);

  const setCardRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    } else {
      cardRefs.current.delete(id);
    }
  };

  useEffect(() => {
    const handlePointerMove = (ev: PointerEvent) => {
      const activeId = draggingIdRef.current;
      if (!activeId) return;

      // Gentle auto-scroll near viewport top/bottom on mobile & desktop
      if (ev.clientY < 80) {
        window.scrollBy({ top: -10 });
      } else if (ev.clientY > window.innerHeight - 80) {
        window.scrollBy({ top: 10 });
      }

      const now = Date.now();
      if (now - lastSwapAtRef.current < 160) return;

      let hoverId: string | null = null;
      for (const [id, el] of cardRefs.current.entries()) {
        if (id === activeId) continue;
        const rect = el.getBoundingClientRect();
        if (
          ev.clientX >= rect.left &&
          ev.clientX <= rect.right &&
          ev.clientY >= rect.top &&
          ev.clientY <= rect.bottom
        ) {
          hoverId = id;
          break;
        }
      }

      if (!hoverId) return;

      const list = orderedColsRef.current;
      const fromIdx = list.findIndex((c) => c.id === activeId);
      const toIdx = list.findIndex((c) => c.id === hoverId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

      const next = [...list];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);

      orderedColsRef.current = next;
      setOrderedCols(next);
      lastSwapAtRef.current = now;
    };

    const handlePointerEnd = () => {
      const activeId = draggingIdRef.current;
      if (!activeId) return;

      draggingIdRef.current = null;
      setDraggingId(null);

      const finalList = orderedColsRef.current;
      const changed = finalList.some(
        (c, idx) => initialOrderIdsRef.current[idx] !== c.id
      );
      if (changed) {
        void onReorderCollections(finalList);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [onReorderCollections]);

  const startDrag = (e: React.PointerEvent, colId: string) => {
    if (orderedColsRef.current.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    draggingIdRef.current = colId;
    setDraggingId(colId);
    initialOrderIdsRef.current = orderedColsRef.current.map((c) => c.id);
    lastSwapAtRef.current = 0;
  };

  const handlePinToTop = async (colId: string) => {
    const idx = orderedCols.findIndex((c) => c.id === colId);
    if (idx <= 0) return;
    const next = [...orderedCols];
    const [target] = next.splice(idx, 1);
    next.unshift(target);
    orderedColsRef.current = next;
    setOrderedCols(next);
    await onReorderCollections(next);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onCreateCollection(newName.trim(), newDesc.trim());
    setNewName('');
    setNewDesc('');
    setCreating(false);
  };

  const startEdit = (col: Collection) => {
    setEditingId(col.id);
    setEditName(col.name);
    setEditDesc(col.description);
    setConfirmDeleteId(null);
  };

  const saveEdit = async (col: Collection) => {
    if (!editName.trim()) return;
    await onUpdateCollection({
      ...col,
      name: editName.trim(),
      description: editDesc.trim(),
    });
    setEditingId(null);
  };

  const handleCreateCategory = async (colId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await onAddCategory(colId, newCatName.trim());
    setNewCatName('');
    setAddingCatForId(null);
  };

  const editingBannerCol = useMemo(
    () => orderedCols.find((c) => c.id === bannerColId) || null,
    [orderedCols, bannerColId]
  );

  const editingBannerPhotos = useMemo(() => {
    if (!editingBannerCol) return [];
    return works.filter(
      (w) =>
        w.collectionId === editingBannerCol.id &&
        w.type === 'photography' &&
        Boolean(w.imageData) &&
        !w.isSealed
    );
  }, [editingBannerCol, works]);

  const resolvedBannerPreview = useMemo(() => {
    if (!editingBannerCol) {
      return { src: undefined, zoom: 1, posX: 50, posY: 50, mode: 'auto-first' as CollectionBannerMode };
    }
    const colWorks = works.filter((w) => w.collectionId === editingBannerCol.id);
    return resolveBannerImage(editingBannerCol.id, bannerDraft, colWorks);
  }, [editingBannerCol, bannerDraft, works]);

  const openBannerEditor = (col: Collection) => {
    setBannerColId(col.id);
    setBannerError(null);
    setBannerDraft({
      mode: col.banner?.mode || 'auto-first',
      workId: col.banner?.workId,
      customImageData: col.banner?.customImageData,
      zoom: col.banner?.zoom ?? 1,
      offsetX: col.banner?.offsetX ?? 0,
      offsetY: col.banner?.offsetY ?? 0,
    });
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBannerError('請選擇有效的圖片檔案（JPG、PNG、WEBP 等）。');
      return;
    }
    setBannerError(null);
    setBannerUploading(true);
    try {
      const dataUrl = await compressBannerImageFile(file);
      setBannerDraft((prev) => ({
        ...prev,
        mode: 'custom-upload',
        customImageData: dataUrl,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      }));
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : '無法處理圖片檔案。');
    } finally {
      setBannerUploading(false);
    }
  };

  const handleBannerCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resolvedBannerPreview.src) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsBannerDragging(true);
    bannerDragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: bannerDraft.offsetX ?? 0,
      origOffsetY: bannerDraft.offsetY ?? 0,
    };
  };

  const handleBannerCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!bannerDragStateRef.current.active || !bannerCropRef.current) return;
    const rect = bannerCropRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = e.clientX - bannerDragStateRef.current.startX;
    const dy = e.clientY - bannerDragStateRef.current.startY;
    // Dragging image right moves focal point left (-), matching intuitive image panning
    const nextX = Math.round(
      Math.min(100, Math.max(-100, bannerDragStateRef.current.origOffsetX - (dx / rect.width) * 180))
    );
    const nextY = Math.round(
      Math.min(100, Math.max(-100, bannerDragStateRef.current.origOffsetY - (dy / rect.height) * 180))
    );
    setBannerDraft((prev) => ({
      ...prev,
      offsetX: nextX,
      offsetY: nextY,
    }));
  };

  const handleBannerCropPointerEnd = () => {
    bannerDragStateRef.current.active = false;
    setIsBannerDragging(false);
  };

  const handleSaveBanner = async () => {
    if (!editingBannerCol || bannerSaving) return;
    if (bannerDraft.mode === 'custom-upload' && !bannerDraft.customImageData) {
      setBannerError('請先從裝置選擇一張圖片，或改用其他來源模式。');
      return;
    }
    setBannerSaving(true);
    try {
      const nextBanner: CollectionBannerConfig = {
        mode: bannerDraft.mode,
        workId: bannerDraft.mode === 'work-photo' ? bannerDraft.workId : undefined,
        customImageData:
          bannerDraft.mode === 'custom-upload' ? bannerDraft.customImageData : undefined,
        zoom: Number((bannerDraft.zoom ?? 1).toFixed(2)),
        offsetX: Math.round(bannerDraft.offsetX ?? 0),
        offsetY: Math.round(bannerDraft.offsetY ?? 0),
      };
      await onUpdateCollection({
        ...editingBannerCol,
        banner: nextBanner,
      });
      setBannerColId(null);
    } finally {
      setBannerSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-stone-200/80 dark:border-stone-800 pb-5">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
            作品集整理與子分類
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            {conciseCopyMode
              ? `共 ${collections.length} 個作品集 · 可拖曳調整順序與子分類`
              : '依主題建立作品集與專屬子分類；拖曳卡片握把可調整顯示順序或將常用作品集置頂。'}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 self-stretch sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="min-h-[44px] px-4 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-4 h-4" />
            <span>新建作品集</span>
          </button>

          <button
            type="button"
            onClick={onOpenBatchExplorer}
            className="min-h-[44px] px-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#191918] text-stone-800 dark:text-stone-200 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0 ml-auto sm:ml-0"
          >
            <FolderTree className="w-4 h-4" />
            <span>檔案總管整理</span>
          </button>
        </div>
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-800 space-y-3"
        >
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            建立新作品集
          </h3>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="作品集名稱（例如：2026 秋日底片）"
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="簡短簡介（選填）"
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="min-h-[40px] px-4 text-xs text-stone-500 hover:text-stone-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium"
            >
              建立
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {orderedCols.map((col, idx) => {
          const colWorks = works.filter((w) => w.collectionId === col.id);
          const photoCount = colWorks.filter((w) => w.type === 'photography').length;
          const writingCount = colWorks.filter((w) => w.type === 'writing').length;
          const resolvedBanner = resolveBannerImage(col.id, col.banner, colWorks);

          const categories = col.categories || [];
          const isEditing = editingId === col.id;
          const isAddingCat = addingCatForId === col.id;
          const isDragging = draggingId === col.id;

          return (
            <motion.div
              key={col.id}
              ref={setCardRef(col.id)}
              layout={draggingId !== null}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`bg-white dark:bg-[#191918] border rounded-2xl overflow-hidden flex flex-col transition-shadow ${
                isDragging
                  ? 'border-[#284152] dark:border-[#E7E5E0] ring-2 ring-[#284152]/30 dark:ring-[#E7E5E0]/30 shadow-xl z-20 scale-[1.01]'
                  : 'border-stone-200/80 dark:border-stone-800'
              }`}
            >
              {/* Cover with unobtrusive banner edit, drag & pin controls */}
              <div className="relative">
                {resolvedBanner.src ? (
                  <div
                    onClick={() => {
                      if (!draggingId) onOpenCollection(col.id);
                    }}
                    className="aspect-[16/6] w-full bg-stone-100 dark:bg-stone-900 overflow-hidden cursor-pointer"
                  >
                    <img
                      src={resolvedBanner.src}
                      alt={col.name}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      style={{
                        objectPosition: `${resolvedBanner.posX}% ${resolvedBanner.posY}%`,
                        transformOrigin: `${resolvedBanner.posX}% ${resolvedBanner.posY}%`,
                        transform: `scale(${resolvedBanner.zoom})`,
                      }}
                      className="w-full h-full object-cover transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      if (!draggingId) onOpenCollection(col.id);
                    }}
                    className="h-24 w-full bg-[#EFECE6]/70 dark:bg-[#20201E] flex items-center justify-center text-stone-400 cursor-pointer"
                  >
                    <Layers className="w-6 h-6 stroke-[1.5]" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openBannerEditor(col);
                  }}
                  aria-label={`自訂作品集 ${col.name} 橫幅`}
                  title="調整橫幅與裁切"
                  className="absolute top-2.5 left-2.5 min-h-[32px] px-2 rounded-lg bg-white/92 dark:bg-[#141413]/90 border border-stone-200/70 dark:border-stone-700/70 text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white inline-flex items-center gap-1 shadow-sm transition-colors text-[11px] font-medium"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>橫幅</span>
                </button>

                {orderedCols.length > 1 && (
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handlePinToTop(col.id);
                        }}
                        aria-label={`置頂作品集 ${col.name}`}
                        title="移至最前（置頂）"
                        className="min-h-[34px] min-w-[34px] px-2 rounded-lg bg-white/92 dark:bg-[#141413]/90 border border-stone-200/70 dark:border-stone-700/70 text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white inline-flex items-center justify-center shadow-sm transition-colors"
                      >
                        <ArrowUpToLine className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      data-no-swipe="true"
                      onPointerDown={(e) => startDrag(e, col.id)}
                      aria-label={`拖曳調整作品集 ${col.name} 順序`}
                      title="按住拖曳排序"
                      className="touch-none select-none cursor-grab active:cursor-grabbing min-h-[34px] min-w-[34px] rounded-lg bg-white/92 dark:bg-[#141413]/90 border border-stone-200/70 dark:border-stone-700/70 text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white inline-flex items-center justify-center shadow-sm transition-colors"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                {isEditing ? (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full min-h-[40px] px-3 rounded-lg bg-[#F7F6F2] dark:bg-[#222220] border border-stone-300 dark:border-stone-700 text-sm font-medium text-stone-900 dark:text-stone-100"
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="簡介"
                      className="w-full min-h-[40px] px-3 rounded-lg bg-[#F7F6F2] dark:bg-[#222220] border border-stone-300 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-300"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-[36px] px-2.5 text-xs text-stone-500 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> 取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(col)}
                        className="min-h-[36px] px-3 rounded-lg bg-[#284152] text-white text-xs flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> 儲存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenCollection(col.id)}
                        className="text-left group"
                      >
                        <h3 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100 group-hover:underline">
                          {col.name}
                        </h3>
                      </button>
                      <span className="text-xs tabular-nums text-stone-400 shrink-0 mt-1">
                        {colWorks.length} 件
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5 leading-relaxed">
                      {col.description || '尚未填寫作品集簡介。'}
                    </p>
                    <p className="text-[11px] tabular-nums text-stone-400 mt-2">
                      攝影 {photoCount} · 文字 {writingCount}
                    </p>

                    {/* Sub-categories attached to this collection */}
                    <div className="mt-3.5 pt-3 border-t border-stone-100 dark:border-stone-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          子分類（{categories.length}）
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingCatForId(isAddingCat ? null : col.id);
                            setNewCatName('');
                          }}
                          className="text-[11px] font-medium text-[#284152] dark:text-stone-300 hover:underline inline-flex items-center gap-0.5 py-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>新增子分類</span>
                        </button>
                      </div>

                      {isAddingCat && (
                        <form
                          onSubmit={(e) => void handleCreateCategory(col.id, e)}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            placeholder="輸入子分類名稱"
                            className="flex-1 min-h-[36px] px-2.5 rounded-lg bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="min-h-[36px] px-3 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium"
                          >
                            加入
                          </button>
                        </form>
                      )}

                      {categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {categories.map((cat) => {
                            const catCount = colWorks.filter((w) => w.category === cat).length;
                            return (
                              <div
                                key={cat}
                                className="inline-flex items-center rounded-lg bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpenCollection(col.id, cat)}
                                  className="px-2.5 py-1.5 text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-700/50 transition-colors tabular-nums"
                                >
                                  {cat} · {catCount}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onDeleteCategory(col.id, cat)}
                                  aria-label={`刪除子分類 ${cat}`}
                                  title="移除此子分類"
                                  className="px-1.5 py-1.5 text-stone-400 hover:text-[#9E3B33] transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        !isAddingCat && (
                          <p className="text-[11px] text-stone-400">
                            尚未建立子分類，可點擊右上方新增。
                          </p>
                        )
                      )}
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onAddWorkInCollection(col.id)}
                        title="在此作品集新增作品"
                        className="min-h-[40px] px-2.5 rounded-lg text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>收錄</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(col)}
                        aria-label="編輯作品集"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {collections.length > 1 &&
                        (confirmDeleteId === col.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              void onDeleteCollection(col.id);
                              setConfirmDeleteId(null);
                            }}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#9E3B33] text-white text-xs"
                          >
                            確認刪除
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(col.id)}
                            aria-label="刪除作品集"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-stone-400 hover:text-[#9E3B33] hover:bg-stone-100 dark:hover:bg-stone-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onExportCollectionPdf(col.id)}
                        title="匯出此作品集為 PDF 電子讀本"
                        className="min-h-[40px] px-2.5 rounded-lg text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 inline-flex items-center gap-1"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenCollection(col.id)}
                        className="min-h-[40px] px-3 rounded-lg text-xs font-medium text-[#284152] dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 inline-flex items-center gap-1"
                      >
                        <span>瀏覽</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Banner Customization & Crop Modal */}
      <BottomSheet
        isOpen={Boolean(editingBannerCol)}
        onClose={() => setBannerColId(null)}
        maxWidthClass="sm:max-w-lg"
        panelClassName="max-h-[92vh] bg-[#F7F6F2] dark:bg-[#171716] border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
      >
        {editingBannerCol && (
          <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between shrink-0">
                <div className="min-w-0">
                  <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100 truncate">
                    作品集橫幅 · {editingBannerCol.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setBannerColId(null)}
                  aria-label="關閉橫幅設定視窗"
                  className="min-h-[40px] min-w-[40px] -mr-2 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
                {/* Interactive Cropper Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>橫幅裁切預覽（16:6）</span>
                    {resolvedBannerPreview.src && (
                      <span className="tabular-nums">
                        {resolvedBannerPreview.zoom.toFixed(2)}x · 拖曳可微調範圍
                      </span>
                    )}
                  </div>

                  <div
                    ref={bannerCropRef}
                    data-no-swipe="true"
                    data-no-sheet-dismiss="true"
                    onPointerDown={handleBannerCropPointerDown}
                    onPointerMove={handleBannerCropPointerMove}
                    onPointerUp={handleBannerCropPointerEnd}
                    onPointerCancel={handleBannerCropPointerEnd}
                    className={`relative aspect-[16/6] w-full rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-[#EFECE6] dark:bg-[#222220] touch-none select-none ${
                      resolvedBannerPreview.src
                        ? isBannerDragging
                          ? 'cursor-grabbing'
                          : 'cursor-grab'
                        : ''
                    }`}
                  >
                    {resolvedBannerPreview.src ? (
                      <>
                        <img
                          src={resolvedBannerPreview.src}
                          alt="橫幅預覽"
                          draggable={false}
                          style={{
                            objectPosition: `${resolvedBannerPreview.posX}% ${resolvedBannerPreview.posY}%`,
                            transformOrigin: `${resolvedBannerPreview.posX}% ${resolvedBannerPreview.posY}%`,
                            transform: `scale(${resolvedBannerPreview.zoom})`,
                          }}
                          className="w-full h-full object-cover pointer-events-none select-none"
                        />
                        {isBannerDragging && (
                          <div className="absolute inset-0 pointer-events-none border-2 border-white/60 grid grid-cols-3 grid-rows-3">
                            <div className="border-r border-b border-white/25" />
                            <div className="border-r border-b border-white/25" />
                            <div className="border-b border-white/25" />
                            <div className="border-r border-b border-white/25" />
                            <div className="border-r border-b border-white/25" />
                            <div className="border-b border-white/25" />
                            <div className="border-r border-white/25" />
                            <div className="border-r border-white/25" />
                            <div />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-stone-400 text-xs px-4 text-center">
                        <Layers className="w-6 h-6 stroke-[1.5]" />
                        <span>此作品集尚無未鎖定攝影作品，可從裝置選擇橫幅圖片。</span>
                      </div>
                    )}
                  </div>

                  {/* Zoom & Reset Controls */}
                  {resolvedBannerPreview.src && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setBannerDraft((prev) => ({
                            ...prev,
                            zoom: Math.max(1, Number(((prev.zoom ?? 1) - 0.15).toFixed(2))),
                          }))
                        }
                        aria-label="縮小橫幅"
                        className="min-h-[36px] min-w-[36px] rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1E1E1C] flex items-center justify-center text-stone-600 dark:text-stone-300"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min={1}
                        max={2.5}
                        step={0.05}
                        value={bannerDraft.zoom ?? 1}
                        onChange={(e) =>
                          setBannerDraft((prev) => ({
                            ...prev,
                            zoom: parseFloat(e.target.value),
                          }))
                        }
                        className="flex-1 accent-[#284152] dark:accent-[#E7E5E0]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setBannerDraft((prev) => ({
                            ...prev,
                            zoom: Math.min(2.5, Number(((prev.zoom ?? 1) + 0.15).toFixed(2))),
                          }))
                        }
                        aria-label="放大橫幅"
                        className="min-h-[36px] min-w-[36px] rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1E1E1C] flex items-center justify-center text-stone-600 dark:text-stone-300"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setBannerDraft((prev) => ({
                            ...prev,
                            zoom: 1,
                            offsetX: 0,
                            offsetY: 0,
                          }))
                        }
                        title="重設縮放與位置"
                        className="min-h-[36px] px-2.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1E1E1C] text-[11px] text-stone-600 dark:text-stone-300 inline-flex items-center gap-1 shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>置中</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Source Mode Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                    橫幅圖片來源
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          id: 'auto-first',
                          label: '自動 · 作品集首張',
                          desc: '預設顯示第一張攝影作品',
                        },
                        {
                          id: 'auto-daily',
                          label: '自動 · 每日隨機輪換',
                          desc: '每日從作品集隨機更換封面',
                        },
                        {
                          id: 'work-photo',
                          label: '挑選 · 作品集內照片',
                          desc: '手動指定任一攝影作品',
                        },
                        {
                          id: 'custom-upload',
                          label: '挑選 · 從裝置選擇圖片',
                          desc: '從相簿或電腦匯入圖片',
                        },
                      ] as const
                    ).map((item) => {
                      const active = bannerDraft.mode === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setBannerError(null);
                            setBannerDraft((prev) => ({
                              ...prev,
                              mode: item.id,
                              workId:
                                item.id === 'work-photo' && !prev.workId
                                  ? editingBannerPhotos[0]?.id
                                  : prev.workId,
                            }));
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-colors ${
                            active
                              ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                              : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1E1E1C] text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          <div className="text-xs font-medium">{item.label}</div>
                          <div className="text-[10px] text-stone-400 mt-0.5">{item.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Contextual Picker */}
                {bannerDraft.mode === 'work-photo' && (
                  <div className="p-3 rounded-xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 space-y-2">
                    <span className="block text-[11px] font-medium text-stone-500 dark:text-stone-400">
                      點擊選擇此作品集內的攝影作品（{editingBannerPhotos.length} 張）
                    </span>
                    {editingBannerPhotos.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-0.5">
                        {editingBannerPhotos.map((pw) => {
                          const selected =
                            (bannerDraft.workId || editingBannerPhotos[0]?.id) === pw.id;
                          return (
                            <button
                              key={pw.id}
                              type="button"
                              onClick={() =>
                                setBannerDraft((prev) => ({
                                  ...prev,
                                  mode: 'work-photo',
                                  workId: pw.id,
                                }))
                              }
                              className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                                selected
                                  ? 'border-[#284152] dark:border-[#E7E5E0] ring-2 ring-[#284152]/25'
                                  : 'border-transparent opacity-80 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={pw.imageData}
                                alt={pw.title}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/55 text-[10px] text-white truncate text-left">
                                {pw.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 py-2">
                        此作品集內尚無未鎖定的攝影作品，請先收錄攝影作品或改為「從裝置選擇圖片」。
                      </p>
                    )}
                  </div>
                )}

                {bannerDraft.mode === 'custom-upload' && (
                  <div className="p-3 rounded-xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 space-y-2">
                    <input
                      ref={bannerFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBannerFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={bannerUploading}
                      onClick={() => bannerFileInputRef.current?.click()}
                      className="w-full min-h-[42px] px-4 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 hover:border-[#284152] dark:hover:border-stone-400 text-xs font-medium text-stone-700 dark:text-stone-200 inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>
                        {bannerUploading
                          ? '正在處理圖片...'
                          : bannerDraft.customImageData
                          ? '更換裝置圖片'
                          : '從裝置相簿或檔案選擇圖片'}
                      </span>
                    </button>
                    <p className="text-[11px] text-stone-400">
                      圖片將自動最佳化並僅儲存於本機離線資料庫中。
                    </p>
                  </div>
                )}

                {bannerDraft.mode === 'auto-daily' && (
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 px-1">
                    目前此作品集共有 {editingBannerPhotos.length} 張可輪換攝影作品，將於每日自動挑選一張呈現。
                  </p>
                )}

                {bannerError && (
                  <p className="text-xs text-[#9E3B33] dark:text-[#E07A70] px-1">
                    {bannerError}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 pb-safe border-t border-stone-200/80 dark:border-stone-800 flex items-center justify-end gap-2 shrink-0 bg-[#F7F6F2] dark:bg-[#171716]">
                <button
                  type="button"
                  onClick={() => setBannerColId(null)}
                  className="min-h-[42px] px-4 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={bannerSaving || bannerUploading}
                  onClick={() => void handleSaveBanner()}
                  className="min-h-[42px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-45"
                >
                  {bannerSaving ? '儲存中...' : '儲存橫幅設定'}
                </button>
              </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
};
