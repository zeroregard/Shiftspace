import { useSyncExternalStore } from 'react';

/**
 * Tracks whether the Shift key is currently held down, globally.
 *
 * Multiple callers subscribe to a single set of window listeners so we pay
 * the cost once regardless of how many components use the hook. Listeners
 * attach on first subscriber and stay for the page lifetime — the Shiftspace
 * UI is single-page and shift tracking is cheap, so there's no benefit to
 * detaching on unmount.
 */
let shiftHeld = false;
const subscribers = new Set<() => void>();
let listenersAttached = false;

function notify(): void {
  for (const cb of subscribers) cb();
}

function updateFrom(e: { shiftKey: boolean }): void {
  if (e.shiftKey === shiftHeld) return;
  shiftHeld = e.shiftKey;
  notify();
}

function ensureListeners(): void {
  if (listenersAttached) return;
  if (typeof window === 'undefined') return;
  listenersAttached = true;

  window.addEventListener(
    'mousemove',
    (e) => {
      updateFrom(e);
    },
    { passive: true }
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      shiftHeld = true;
      notify();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      shiftHeld = false;
      notify();
    }
  });
  // Dropping focus on the tab can swallow keyup — reset defensively.
  window.addEventListener('blur', () => {
    if (!shiftHeld) return;
    shiftHeld = false;
    notify();
  });
}

function subscribe(cb: () => void): () => void {
  ensureListeners();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot(): boolean {
  return shiftHeld;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useShiftHeld(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
