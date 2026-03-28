import { useEffect, useLayoutEffect, useRef } from 'react';
import type React from 'react';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const WHEEL_SENSITIVITY = 0.001;
const PINCH_SENSITIVITY = 0.01;
const BASE_GRID_SIZE = 24;

/**
 * Gives a container drag-to-pan and pinch/scroll-to-zoom, matching TreeCanvas.
 *
 * Spread the container handlers onto the outer (clipping) div and pass
 * `containerRef` to it. Pass `contentRef` to the inner wrapper that you
 * want to translate/scale. `backgroundPosition` and `backgroundSize` on the
 * container are also updated so the dotted grid moves and scales in sync.
 */
export function useDragPan() {
  const containerRef = useRef<HTMLDivElement>(null);
  const translateRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const hasDraggedRef = useRef(false);
  const lastTouchDistRef = useRef<number | null>(null);

  const apply = (x: number, y: number, zoom: number) => {
    if (translateRef.current) {
      translateRef.current.style.transform = `translate(${x}px,${y}px)`;
    }
    if (contentRef.current) {
      contentRef.current.style.zoom = String(zoom);
    }
    if (containerRef.current) {
      containerRef.current.style.backgroundPosition = `${x}px ${y}px`;
      const gridSize = BASE_GRID_SIZE * zoom;
      containerRef.current.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    }
  };

  // Set initial transform so backgroundSize is correct from the start
  useLayoutEffect(() => {
    apply(0, 0, 1);
  }, []);

  // Wheel handler — non-passive so we can preventDefault
  // Figma-style: scroll=pan, shift+scroll=horizontal pan, cmd/ctrl+scroll=zoom, pinch=zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const isZoom = e.ctrlKey || e.metaKey;
      if (isZoom) {
        const sensitivity = e.ctrlKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
        const rect = el!.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const prevZoom = zoomRef.current;
        const newZoom = Math.min(
          Math.max(prevZoom * (1 - e.deltaY * sensitivity), MIN_ZOOM),
          MAX_ZOOM
        );
        const canvasX = (cursorX - posRef.current.x) / prevZoom;
        const canvasY = (cursorY - posRef.current.y) / prevZoom;
        const nx = cursorX - canvasX * newZoom;
        const ny = cursorY - canvasY * newZoom;
        zoomRef.current = newZoom;
        posRef.current = { x: nx, y: ny };
        apply(nx, ny, newZoom);
      } else if (e.shiftKey) {
        const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const nx = posRef.current.x - dx;
        posRef.current = { ...posRef.current, x: nx };
        apply(nx, posRef.current.y, zoomRef.current);
      } else {
        const nx = posRef.current.x - e.deltaX;
        const ny = posRef.current.y - e.deltaY;
        posRef.current = { x: nx, y: ny };
        apply(nx, ny, zoomRef.current);
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Touch pinch — non-passive so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function getTouchDist(e: TouchEvent): number {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.hypot(dx, dy);
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastTouchDistRef.current = getTouchDist(e);
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
        e.preventDefault();
        const newDist = getTouchDist(e);
        const prevDist = lastTouchDistRef.current;
        lastTouchDistRef.current = newDist;
        const rect = el!.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const prevZoom = zoomRef.current;
        const newZoom = Math.min(Math.max(prevZoom * (newDist / prevDist), MIN_ZOOM), MAX_ZOOM);
        const canvasX = (midX - posRef.current.x) / prevZoom;
        const canvasY = (midY - posRef.current.y) / prevZoom;
        const nx = midX - canvasX * newZoom;
        const ny = midY - canvasY * newZoom;
        zoomRef.current = newZoom;
        posRef.current = { x: nx, y: ny };
        apply(nx, ny, newZoom);
      }
    }

    function handleTouchEnd() {
      lastTouchDistRef.current = null;
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

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
      apply(nx, ny, zoomRef.current);
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

  return {
    containerRef,
    translateRef,
    contentRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClickCapture,
  };
}
