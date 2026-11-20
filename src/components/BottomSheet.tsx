import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface BottomSheetProps {
  isOpen: boolean;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  swipeToDismiss?: boolean;
  zIndexClass?: string;
  backdropToneClass?: string;
  maxWidthClass?: string;
  panelClassName?: string;
  showHandle?: boolean;
  handleInsidePaddedPanel?: boolean;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  closeOnBackdrop = true,
  swipeToDismiss = true,
  zIndexClass = 'z-50',
  backdropToneClass = 'bg-black/50',
  maxWidthClass = 'sm:max-w-lg',
  panelClassName = '',
  showHandle = true,
  handleInsidePaddedPanel = false,
  children,
}) => {
  useBodyScrollLock(isOpen);
  const { animationOverhaul } = useMotionPreferences();

  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dragLayerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const backdropEl = backdropRef.current;
    if (!isOpen || !backdropEl) return;

    const handleBackdropTouchMove = (e: TouchEvent) => {
      if (e.target === backdropEl && e.cancelable) {
        e.preventDefault();
      }
    };

    backdropEl.addEventListener('touchmove', handleBackdropTouchMove, { passive: false });
    return () => {
      backdropEl.removeEventListener('touchmove', handleBackdropTouchMove);
    };
  }, [isOpen]);

  useEffect(() => {
    const panelEl = panelRef.current;
    const dragLayerEl = dragLayerRef.current;
    if (!isOpen || !panelEl || !dragLayerEl || !swipeToDismiss) return;

    let snapBackTimer: number | null = null;
    let gesture: {
      startX: number;
      startY: number;
      lastY: number;
      startTime: number;
      startedAtTop: boolean;
      mode: 'pending' | 'dragging' | 'ignored';
    } | null = null;

    const hasScrolledAncestor = (target: HTMLElement): boolean => {
      let cur: HTMLElement | null = target;
      while (cur && cur !== panelEl) {
        const style = window.getComputedStyle(cur);
        const ovY = style.overflowY;
        if (
          (ovY === 'auto' || ovY === 'scroll') &&
          cur.scrollHeight > cur.clientHeight + 2 &&
          cur.scrollTop > 1
        ) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!onCloseRef.current || e.touches.length !== 1) {
        gesture = null;
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) {
        gesture = null;
        return;
      }
      if (
        target.closest(
          'textarea, input[type="range"], [role="slider"], canvas, [data-no-sheet-dismiss="true"]'
        )
      ) {
        gesture = null;
        return;
      }

      if (snapBackTimer !== null) {
        window.clearTimeout(snapBackTimer);
        snapBackTimer = null;
      }

      gesture = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        lastY: e.touches[0].clientY,
        startTime: Date.now(),
        startedAtTop: !hasScrolledAncestor(target),
        mode: 'pending',
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!gesture || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;
      gesture.lastY = touch.clientY;

      if (gesture.mode === 'ignored') return;

      if (gesture.mode === 'pending') {
        if (Math.hypot(dx, dy) < 7) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.15 || dy <= 0) {
          gesture.mode = 'ignored';
          return;
        }
        const target = e.target as HTMLElement | null;
        if (!gesture.startedAtTop || (target && hasScrolledAncestor(target))) {
          gesture.mode = 'ignored';
          return;
        }
        gesture.mode = 'dragging';
      }

      if (gesture.mode === 'dragging') {
        if (e.cancelable) e.preventDefault();
        const clampedDy = Math.max(0, dy);
        dragLayerEl.style.transition = 'none';
        dragLayerEl.style.transform = `translate3d(0, ${clampedDy}px, 0)`;
        if (backdropRef.current) {
          const progress = Math.min(1, clampedDy / 320);
          backdropRef.current.style.transition = 'none';
          backdropRef.current.style.opacity = String(Math.max(0.25, 1 - progress * 0.65));
        }
      }
    };

    const handleTouchEnd = () => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (g.mode !== 'dragging') return;

      const dy = Math.max(0, g.lastY - g.startY);
      const dt = Math.max(1, Date.now() - g.startTime);
      const velocity = dy / dt;
      const shouldDismiss = dy >= 96 || (velocity >= 0.48 && dy >= 42);

      if (shouldDismiss && onCloseRef.current) {
        if (backdropRef.current) {
          backdropRef.current.style.transition = '';
          backdropRef.current.style.opacity = '';
        }
        onCloseRef.current();
        return;
      }

      dragLayerEl.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)';
      dragLayerEl.style.transform = 'translate3d(0, 0, 0)';
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'opacity 200ms ease';
        backdropRef.current.style.opacity = '';
      }
      snapBackTimer = window.setTimeout(() => {
        dragLayerEl.style.transition = '';
        dragLayerEl.style.transform = '';
        if (backdropRef.current) {
          backdropRef.current.style.transition = '';
        }
        snapBackTimer = null;
      }, 230);
    };

    panelEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    panelEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    panelEl.addEventListener('touchend', handleTouchEnd, { passive: true });
    panelEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      if (snapBackTimer !== null) window.clearTimeout(snapBackTimer);
      panelEl.removeEventListener('touchstart', handleTouchStart);
      panelEl.removeEventListener('touchmove', handleTouchMove);
      panelEl.removeEventListener('touchend', handleTouchEnd);
      panelEl.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isOpen, swipeToDismiss]);

  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : true;

  const sheetNode = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={backdropRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: animationOverhaul ? 0.24 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          data-no-swipe="true"
          onClick={() => {
            if (closeOnBackdrop && onClose) onClose();
          }}
          className={`fixed inset-0 ${zIndexClass} ${backdropToneClass} flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain`}
        >
          <div
            ref={dragLayerRef}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidthClass} flex justify-center`}
          >
            <motion.div
              ref={panelRef}
              initial={
                isMobile
                  ? animationOverhaul
                    ? { y: '100%', opacity: 0.96 }
                    : { y: '100%' }
                  : animationOverhaul
                  ? { opacity: 0, y: 36, scale: 0.97 }
                  : { opacity: 0, y: 24, scale: 0.985 }
              }
              animate={
                isMobile
                  ? { y: 0, opacity: 1 }
                  : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                isMobile
                  ? animationOverhaul
                    ? { y: '100%', opacity: 0.92 }
                    : { y: '100%', opacity: 0.94 }
                  : animationOverhaul
                  ? { opacity: 0, y: 32, scale: 0.97 }
                  : { opacity: 0, y: 28, scale: 0.985 }
              }
              transition={
                animationOverhaul
                  ? { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                  : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
              }
              data-no-swipe="true"
              className={`w-full overscroll-contain will-change-transform ${panelClassName}`}
            >
              {showHandle && (
                <div
                  className={`sm:hidden flex justify-center shrink-0 ${
                    handleInsidePaddedPanel ? '-mt-2 pb-1' : 'pt-2.5 pb-0.5'
                  }`}
                >
                  <span className="w-9 h-1 rounded-full bg-stone-300/85 dark:bg-stone-700/85" />
                </div>
              )}
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(sheetNode, document.body);
  }

  return sheetNode;
};
