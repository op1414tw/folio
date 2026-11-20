import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;
let prevStyles: {
  htmlOverflow: string;
  htmlOverscroll: string;
  bodyOverflow: string;
  bodyOverscroll: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyPaddingRight: string;
} | null = null;

export function isAnyModalLocked(): boolean {
  return lockCount > 0;
}

function lockBodyScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (lockCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    const html = document.documentElement;
    const body = document.body;
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    prevStyles = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight,
    };

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount += 1;
}

function unlockBodyScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && prevStyles) {
    const html = document.documentElement;
    const body = document.body;
    const styles = prevStyles;
    prevStyles = null;

    html.style.overflow = styles.htmlOverflow;
    html.style.overscrollBehavior = styles.htmlOverscroll;
    body.style.overflow = styles.bodyOverflow;
    body.style.overscrollBehavior = styles.bodyOverscroll;
    body.style.position = styles.bodyPosition;
    body.style.top = styles.bodyTop;
    body.style.left = styles.bodyLeft;
    body.style.right = styles.bodyRight;
    body.style.width = styles.bodyWidth;
    body.style.paddingRight = styles.bodyPaddingRight;

    try {
      window.scrollTo({ top: savedScrollY, behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo(0, savedScrollY);
    }
  }
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [locked]);
}
