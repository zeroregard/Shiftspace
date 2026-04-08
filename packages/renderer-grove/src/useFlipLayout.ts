import { useRef, useLayoutEffect } from 'react';

export function useFlipLayout<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[],
  duration = 350,
  easing = 'cubic-bezier(0.4, 0, 0.2, 1)'
) {
  const containerRef = useRef<T>(null);
  const rectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const prevRects = rectsRef.current;
    const children = container.children;
    const newRects = new Map<string, DOMRect>();

    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      const id = el.dataset.flipId;
      if (id) newRects.set(id, el.getBoundingClientRect());
    }

    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      const id = el.dataset.flipId;
      if (!id) continue;

      const prev = prevRects.get(id);
      const curr = newRects.get(id);
      if (!prev || !curr) continue;

      const dx = prev.left - curr.left;
      const dy = prev.top - curr.top;

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = 'none';

      requestAnimationFrame(() => {
        el.style.transition = `transform ${duration}ms ${easing}`;
        el.style.transform = '';

        const cleanup = () => {
          el.style.transition = '';
          el.removeEventListener('transitionend', cleanup);
        };
        el.addEventListener('transitionend', cleanup);
      });
    }

    rectsRef.current = newRects;
  }, deps);

  return containerRef;
}
