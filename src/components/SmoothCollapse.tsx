import React, { useEffect, useRef, useState } from 'react';

interface SmoothCollapseProps {
  open: boolean;
  animate?: boolean;
  unmountOnClose?: boolean;
  durationMs?: number;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}

/**
 * Lightweight CSS Grid-row accordion (0fr <-> 1fr) that delegates height interpolation
 * to the browser engine without per-frame JS layout measurements or Framer reflow loops.
 */
export const SmoothCollapse: React.FC<SmoothCollapseProps> = ({
  open,
  animate = true,
  unmountOnClose = true,
  durationMs = 240,
  className = '',
  innerClassName = '',
  children,
}) => {
  const [rendered, setRendered] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!animate) {
      setRendered(open);
      setExpanded(open);
      return;
    }

    if (open) {
      setRendered(true);
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = window.requestAnimationFrame(() => {
          setExpanded(true);
          rafRef.current = null;
        });
      });
    } else {
      setExpanded(false);
      if (unmountOnClose) {
        timerRef.current = window.setTimeout(() => {
          setRendered(false);
          timerRef.current = null;
        }, durationMs + 30);
      }
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, animate, unmountOnClose, durationMs]);

  if (unmountOnClose && !rendered) {
    return null;
  }

  return (
    <div
      aria-hidden={!open}
      style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        opacity: expanded ? 1 : 0,
        transition: animate
          ? `grid-template-rows ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${Math.round(
              durationMs * 0.8
            )}ms ease`
          : 'none',
      }}
      className={`${!open ? 'pointer-events-none' : ''} ${className}`}
    >
      <div className={`min-h-0 overflow-hidden ${innerClassName}`}>{children}</div>
    </div>
  );
};
