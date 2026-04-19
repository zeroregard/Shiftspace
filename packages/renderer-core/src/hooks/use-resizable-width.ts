import { useCallback, useRef, useState } from 'react';

interface UseResizableWidthOptions {
  storageKey: string;
  min: number;
  max: number;
  defaultWidth: number;
}

interface ResizableWidth {
  width: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

function loadPersistedWidth(
  storageKey: string,
  min: number,
  max: number,
  fallback: number
): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const n = Number(stored);
      if (n >= min && n <= max) return n;
    }
  } catch {
    // localStorage unavailable — use fallback
  }
  return fallback;
}

function persistWidth(storageKey: string, width: number): void {
  try {
    localStorage.setItem(storageKey, String(Math.round(width)));
  } catch {
    // ignore
  }
}

/**
 * Hook for a horizontally resizable panel with localStorage persistence.
 * Returns the current width and pointer handlers for a drag handle element.
 */
export function useResizableWidth({
  storageKey,
  min,
  max,
  defaultWidth,
}: UseResizableWidthOptions): ResizableWidth {
  const [width, setWidth] = useState(() => loadPersistedWidth(storageKey, min, max, defaultWidth));
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [width]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(max, Math.max(min, startWidth.current + delta));
      setWidth(next);
    },
    [min, max]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      const delta = e.clientX - startX.current;
      const next = Math.min(max, Math.max(min, startWidth.current + delta));
      persistWidth(storageKey, next);
    },
    [storageKey, min, max]
  );

  return { width, onPointerDown, onPointerMove, onPointerUp };
}
