import React, { useLayoutEffect, useRef } from 'react';
import { animate } from 'motion/react';
import { useMotionPreferences } from '../contexts/MotionConfigContext';

interface RelativeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PillSnapshot {
  trackEl: HTMLElement;
  buttonEl: HTMLElement;
  liveBox?: RelativeBox;
  stopAnim?: () => void;
}

const pillRegistry = new Map<string, PillSnapshot>();

function measureRelativeToTrack(buttonEl: HTMLElement, trackEl: HTMLElement): RelativeBox {
  const btnRect = buttonEl.getBoundingClientRect();
  const trackRect = trackEl.getBoundingClientRect();
  const scaleX = trackEl.offsetWidth > 0 ? trackRect.width / trackEl.offsetWidth : 1;
  const scaleY = trackEl.offsetHeight > 0 ? trackRect.height / trackEl.offsetHeight : 1;
  const safeSX = scaleX > 0.05 ? scaleX : 1;
  const safeSY = scaleY > 0.05 ? scaleY : 1;

  return {
    left: (btnRect.left - trackRect.left) / safeSX,
    top: (btnRect.top - trackRect.top) / safeSY,
    width: btnRect.width / safeSX,
    height: btnRect.height / safeSY,
  };
}

interface SlidingPillProps {
  layoutId: string;
  className?: string;
}

export const SlidingPill: React.FC<SlidingPillProps> = ({
  layoutId,
  className = 'bg-white dark:bg-[#111110] shadow-sm rounded-lg',
}) => {
  const { animationOverhaul } = useMotionPreferences();
  const pillRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!animationOverhaul) {
      const existing = pillRegistry.get(layoutId);
      existing?.stopAnim?.();
      pillRegistry.delete(layoutId);
      return;
    }

    const el = pillRef.current;
    const buttonEl = el?.parentElement;
    const trackEl = buttonEl?.parentElement;
    if (!el || !buttonEl || !trackEl) return;

    const prev = pillRegistry.get(layoutId);
    prev?.stopAnim?.();

    const curBox = measureRelativeToTrack(buttonEl, trackEl);
    const entry: PillSnapshot = {
      trackEl,
      buttonEl,
    };
    pillRegistry.set(layoutId, entry);

    const canSlide =
      Boolean(prev) &&
      prev!.trackEl === trackEl &&
      prev!.buttonEl !== buttonEl &&
      prev!.buttonEl.isConnected &&
      curBox.width > 0 &&
      curBox.height > 0;

    if (!canSlide) return;

    const fromBox = prev!.liveBox ?? measureRelativeToTrack(prev!.buttonEl, trackEl);
    const dx = fromBox.left - curBox.left;
    const dy = fromBox.top - curBox.top;

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(fromBox.width - curBox.width) < 0.5) {
      return;
    }

    let cancelled = false;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.width = `${fromBox.width}px`;
    el.style.height = `${fromBox.height}px`;
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

    const clearInlineStyles = () => {
      el.style.transform = '';
      el.style.width = '';
      el.style.height = '';
      el.style.right = '';
      el.style.bottom = '';
    };

    const controls = animate(0, 1, {
      type: 'spring',
      stiffness: 360,
      damping: 30,
      mass: 0.85,
      onUpdate: (p) => {
        if (cancelled) return;
        const x = dx * (1 - p);
        const y = dy * (1 - p);
        const w = Math.max(0, fromBox.width + (curBox.width - fromBox.width) * p);
        const h = Math.max(0, fromBox.height + (curBox.height - fromBox.height) * p);
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        entry.liveBox = {
          left: curBox.left + x,
          top: curBox.top + y,
          width: w,
          height: h,
        };
      },
      onComplete: () => {
        if (cancelled) return;
        clearInlineStyles();
        entry.liveBox = undefined;
        entry.stopAnim = undefined;
      },
    });

    entry.stopAnim = () => {
      cancelled = true;
      controls.stop();
      clearInlineStyles();
    };

    return () => {
      cancelled = true;
      controls.stop();
      clearInlineStyles();
    };
  }, [layoutId, animationOverhaul]);

  return (
    <span
      ref={pillRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
    />
  );
};

interface SlidingNavIndicatorProps {
  layoutId: string;
  variant: 'mobile-top-bar' | 'desktop-underline';
  className?: string;
}

export const SlidingNavIndicator: React.FC<SlidingNavIndicatorProps> = ({
  layoutId,
  variant,
  className = '',
}) => {
  const { animationOverhaul } = useMotionPreferences();
  const barRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!animationOverhaul) {
      const existing = pillRegistry.get(layoutId);
      existing?.stopAnim?.();
      pillRegistry.delete(layoutId);
      return;
    }

    const el = barRef.current;
    const buttonEl = el?.parentElement;
    const trackEl = buttonEl?.parentElement;
    if (!el || !buttonEl || !trackEl) return;

    const prev = pillRegistry.get(layoutId);
    prev?.stopAnim?.();

    const curBox = measureRelativeToTrack(buttonEl, trackEl);
    const entry: PillSnapshot = {
      trackEl,
      buttonEl,
    };
    pillRegistry.set(layoutId, entry);

    const canSlide =
      Boolean(prev) &&
      prev!.trackEl === trackEl &&
      prev!.buttonEl !== buttonEl &&
      prev!.buttonEl.isConnected &&
      curBox.width > 0;

    if (!canSlide) return;

    const fromBox = prev!.liveBox ?? measureRelativeToTrack(prev!.buttonEl, trackEl);

    if (variant === 'mobile-top-bar') {
      const fromCenter = fromBox.left + fromBox.width / 2;
      const curCenter = curBox.left + curBox.width / 2;
      const dx = fromCenter - curCenter;
      if (Math.abs(dx) < 0.5) return;

      let cancelled = false;
      el.style.transform = `translate3d(${dx}px, 0, 0)`;

      const controls = animate(0, 1, {
        type: 'spring',
        stiffness: 400,
        damping: 34,
        mass: 0.78,
        onUpdate: (p) => {
          if (cancelled) return;
          const x = dx * (1 - p);
          el.style.transform = `translate3d(${x}px, 0, 0)`;
          entry.liveBox = {
            ...curBox,
            left: curBox.left + x,
          };
        },
        onComplete: () => {
          if (cancelled) return;
          el.style.transform = '';
          entry.liveBox = undefined;
          entry.stopAnim = undefined;
        },
      });

      entry.stopAnim = () => {
        cancelled = true;
        controls.stop();
        el.style.transform = '';
      };

      return () => {
        cancelled = true;
        controls.stop();
        el.style.transform = '';
      };
    }

    // desktop-underline
    const dx = fromBox.left - curBox.left;
    if (Math.abs(dx) < 0.5 && Math.abs(fromBox.width - curBox.width) < 0.5) return;

    let cancelled = false;
    el.style.right = 'auto';
    el.style.width = `${fromBox.width}px`;
    el.style.transform = `translate3d(${dx}px, 0, 0)`;

    const clearInline = () => {
      el.style.transform = '';
      el.style.width = '';
      el.style.right = '';
    };

    const controls = animate(0, 1, {
      type: 'spring',
      stiffness: 400,
      damping: 34,
      mass: 0.78,
      onUpdate: (p) => {
        if (cancelled) return;
        const x = dx * (1 - p);
        const w = Math.max(0, fromBox.width + (curBox.width - fromBox.width) * p);
        el.style.transform = `translate3d(${x}px, 0, 0)`;
        el.style.width = `${w}px`;
        entry.liveBox = {
          ...curBox,
          left: curBox.left + x,
          width: w,
        };
      },
      onComplete: () => {
        if (cancelled) return;
        clearInline();
        entry.liveBox = undefined;
        entry.stopAnim = undefined;
      },
    });

    entry.stopAnim = () => {
      cancelled = true;
      controls.stop();
      clearInline();
    };

    return () => {
      cancelled = true;
      controls.stop();
      clearInline();
    };
  }, [layoutId, variant, animationOverhaul]);

  if (variant === 'mobile-top-bar') {
    return (
      <span
        ref={barRef}
        aria-hidden="true"
        className={`pointer-events-none absolute top-0.5 left-0 right-0 mx-auto w-8 h-[3px] rounded-full bg-[#284152] dark:bg-[#E7E5E0] ${className}`}
      />
    );
  }

  return (
    <span
      ref={barRef}
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full bg-[#284152] dark:bg-[#E7E5E0] ${className}`}
    />
  );
};
