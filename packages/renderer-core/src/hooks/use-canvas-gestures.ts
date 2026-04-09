import React, { useEffect, useRef } from 'react';
import type { PanZoomConfig } from '../tree-canvas';

interface Transform {
  x: number;
  y: number;
  zoom: number;
}

const DEFAULT_PAN_ZOOM_CONFIG: Required<PanZoomConfig> = {
  zoomModifiers: ['ctrl', 'meta'],
  pinchSensitivity: 0.01,
  wheelSensitivity: 0.001,
  maxZoom: 3,
  minZoom: 0.1,
};

interface UseCanvasGesturesOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  panZoomConfig?: PanZoomConfig;
  isPanningRef: React.MutableRefObject<boolean>;
  setTransform: React.Dispatch<React.SetStateAction<Transform>>;
}

/**
 * Attaches non-passive wheel and touch event listeners to the canvas container
 * for zoom (pinch / ctrl+scroll) and pan (scroll / swipe) gestures.
 */
export function useCanvasGestures({
  containerRef,
  panZoomConfig,
  isPanningRef,
  setTransform,
}: UseCanvasGesturesOptions): void {
  const panZoomConfigRef = useRef<Required<PanZoomConfig>>(DEFAULT_PAN_ZOOM_CONFIG);
  panZoomConfigRef.current = { ...DEFAULT_PAN_ZOOM_CONFIG, ...panZoomConfig };
  const lastTouchDistRef = useRef<number | null>(null);

  // Wheel handler
  useEffect(() => {
    const el = containerRef.current!;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const cfg = panZoomConfigRef.current;
      const isZoom = cfg.zoomModifiers.some(
        (mod) =>
          (mod === 'ctrl' && e.ctrlKey) ||
          (mod === 'meta' && e.metaKey) ||
          (mod === 'alt' && e.altKey)
      );
      if (isZoom) {
        const sensitivity = e.ctrlKey ? cfg.pinchSensitivity : cfg.wheelSensitivity;
        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        setTransform((prev) => {
          const newZoom = Math.min(
            Math.max(prev.zoom * (1 - e.deltaY * sensitivity), cfg.minZoom),
            cfg.maxZoom
          );
          const canvasX = (cursorX - prev.x) / prev.zoom;
          const canvasY = (cursorY - prev.y) / prev.zoom;
          return { zoom: newZoom, x: cursorX - canvasX * newZoom, y: cursorY - canvasY * newZoom };
        });
      } else if (e.shiftKey) {
        const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        setTransform((prev) => ({ ...prev, x: prev.x - dx }));
      } else {
        setTransform((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Touch events for pinch-to-zoom
  useEffect(() => {
    const el = containerRef.current!;

    function getTouchDist(e: TouchEvent): number {
      const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
      const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
      return Math.hypot(dx, dy);
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastTouchDistRef.current = getTouchDist(e);
        isPanningRef.current = false;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
        e.preventDefault();
        const newDist = getTouchDist(e);
        const prevDist = lastTouchDistRef.current;
        lastTouchDistRef.current = newDist;
        const rect = el.getBoundingClientRect();
        const midX = (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2 - rect.left;
        const midY = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2 - rect.top;
        setTransform((prev) => {
          const { minZoom, maxZoom } = panZoomConfigRef.current;
          const newZoom = Math.min(Math.max(prev.zoom * (newDist / prevDist), minZoom), maxZoom);
          const canvasX = (midX - prev.x) / prev.zoom;
          const canvasY = (midY - prev.y) / prev.zoom;
          return { zoom: newZoom, x: midX - canvasX * newZoom, y: midY - canvasY * newZoom };
        });
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
}
