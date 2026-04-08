import { useRef, useLayoutEffect } from 'react';

const FLIP_BUILD = 2;
console.log('[FLIP] module loaded, build:', FLIP_BUILD);

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
      console.log('[FLIP] no container ref');
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

    console.log('[FLIP] prevRects:', prevRects.size, 'newRects:', newRects.size, 'deps:', JSON.stringify(deps));

    let animatedCount = 0;
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

      animatedCount++;
      console.log('[FLIP] animating', id, 'dy:', dy);

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

    if (animatedCount > 0) console.log('[FLIP] animated', animatedCount, 'elements');

    rectsRef.current = newRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
