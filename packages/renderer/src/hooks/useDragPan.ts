import { useRef } from 'react';
import type React from 'react';

/**
 * Gives a container the same drag-to-pan feel as TreeCanvas.
 *
 * Spread the container handlers onto the outer (clipping) div and pass
 * `containerRef` to it. Pass `contentRef` to the inner wrapper that you
 * want to translate.  `backgroundPosition` on the container is also updated
 * so the dotted grid moves in sync with the content.
 */
export function useDragPan() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  const apply = (x: number, y: number) => {
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${x}px,${y}px)`;
    }
    if (containerRef.current) {
      containerRef.current.style.backgroundPosition = `${x}px ${y}px`;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      tx: posRef.current.x,
      ty: posRef.current.y,
    };
    hasDraggedRef.current = false;
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    if (!hasDraggedRef.current && Math.abs(dx) + Math.abs(dy) > 4) {
      hasDraggedRef.current = true;
    }
    if (hasDraggedRef.current) {
      const nx = panRef.current.tx + dx;
      const ny = panRef.current.ty + dy;
      posRef.current = { x: nx, y: ny };
      apply(nx, ny);
    }
  };

  const onPointerUp = () => {
    panRef.current = null;
    if (containerRef.current) containerRef.current.style.cursor = 'grab';
  };

  /** Prevents child button clicks that immediately follow a drag. */
  const onClickCapture = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return { containerRef, contentRef, onPointerDown, onPointerMove, onPointerUp, onClickCapture };
}
