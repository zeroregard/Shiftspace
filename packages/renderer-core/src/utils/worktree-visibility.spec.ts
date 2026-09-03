import { describe, it, expect } from 'vitest';
import { worktreeVisibilityClass, toWorktreeVisibilityMode } from './worktree-visibility';

describe('worktreeVisibilityClass', () => {
  it('adds nothing for an always-visible section', () => {
    expect(worktreeVisibilityClass('always')).toBe('');
  });

  it('reveals a hover section on hover and on keyboard focus', () => {
    const cls = worktreeVisibilityClass('hover');
    expect(cls).toContain('opacity-0');
    expect(cls).toContain('group-hover:opacity-100');
    expect(cls).toContain('group-focus-within:opacity-100');
  });

  it('keeps a faded section unclickable until it is revealed', () => {
    const cls = worktreeVisibilityClass('hover');
    expect(cls).toContain('pointer-events-none');
    expect(cls).toContain('group-hover:pointer-events-auto');
  });

  it('returns null for a section that is off, so the caller can skip it', () => {
    expect(worktreeVisibilityClass('off')).toBeNull();
  });
});

describe('toWorktreeVisibilityMode', () => {
  it('accepts every valid mode', () => {
    expect(toWorktreeVisibilityMode('always', 'off')).toBe('always');
    expect(toWorktreeVisibilityMode('hover', 'off')).toBe('hover');
    expect(toWorktreeVisibilityMode('off', 'always')).toBe('off');
  });

  it('falls back for anything else', () => {
    expect(toWorktreeVisibilityMode(undefined, 'hover')).toBe('hover');
    expect(toWorktreeVisibilityMode('visible', 'always')).toBe('always');
    expect(toWorktreeVisibilityMode(null, 'off')).toBe('off');
  });
});
