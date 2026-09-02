import type { WorktreeVisibilityMode } from '../types';

/**
 * Tailwind classes that apply a visibility mode to one section of a worktree
 * card, which carries the `group` class.
 *
 * `hover` fades the section rather than unmounting it: the card keeps the same
 * height at rest and while hovered, so a grove of cards doesn't reshuffle as
 * the pointer sweeps across it. It also reveals on keyboard focus, so a faded
 * section is still reachable by tab. `off` returns `null` — the caller skips
 * rendering entirely and the space is reclaimed.
 */
export function worktreeVisibilityClass(mode: WorktreeVisibilityMode): string | null {
  if (mode === 'off') return null;
  if (mode === 'hover') {
    return [
      'opacity-0 pointer-events-none transition-opacity',
      'group-hover:opacity-100 group-hover:pointer-events-auto',
      'group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
    ].join(' ');
  }
  return '';
}

/** Coerce an unknown config value into a visibility mode, falling back to `fallback`. */
export function toWorktreeVisibilityMode(
  value: unknown,
  fallback: WorktreeVisibilityMode
): WorktreeVisibilityMode {
  return value === 'always' || value === 'hover' || value === 'off' ? value : fallback;
}
