import { describe, it, expect } from 'vitest';
import type { WorktreeState } from '../types';
import { sortWorktrees } from './sort-worktrees';

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt',
    path: '/repo/feature',
    branch: 'feature',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

describe('sortWorktrees – last-updated', () => {
  it('sorts by worktree-level lastActivityAt regardless of file state', () => {
    const main = makeWt({ id: 'main', path: '/repo', isMainWorktree: true, lastActivityAt: 1 });
    const older = makeWt({ id: 'a', path: '/repo/a', lastActivityAt: 100 });
    // newer has no files but recent activity (e.g. just committed / just checked out)
    const newer = makeWt({ id: 'b', path: '/repo/b', lastActivityAt: 9_000, files: [] });
    const sorted = sortWorktrees([older, main, newer], 'last-updated');
    expect(sorted.map((w) => w.id)).toEqual(['main', 'b', 'a']);
  });
});
