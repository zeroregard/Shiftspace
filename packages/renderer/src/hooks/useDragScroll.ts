import { useRef } from 'react';
import type React from 'react';

/**
 * Enables click-drag-to-scroll on a container element.
 *
 * Spread the returned handlers onto the scrollable div. Clicks on child
 * interactive elements are preserved: the `onClickCapture` handler intercepts
 * the click event in the capture phase and cancels it only when the pointer
 * actually moved (drag), not on a plain click.
 */
export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; scrollTop: number } | null>(null);
  const hasDraggedRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    dragRef.current = { startY: e.clientY, scrollTop: el.scrollTop };
    hasDraggedRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const el = ref.current;
    if (!el) return;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dy) > 4) {
      hasDraggedRef.current = true;
      el.scrollTop = dragRef.current.scrollTop - dy;
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  /** Cancel the click that follows a drag so child buttons aren't triggered. */
  const onClickCapture = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp, onClickCapture };
}
