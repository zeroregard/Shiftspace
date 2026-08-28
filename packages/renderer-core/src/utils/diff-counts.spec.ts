import { describe, it, expect } from 'vitest';
import { resolveWorktreeDiffCounts } from './diff-counts';
import type { FileChange, WorktreeState } from '../types';

function file(path: string, linesAdded: number, linesRemoved: number): FileChange {
  return { path, status: 'modified', staged: false, linesAdded, linesRemoved, lastChangedAt: 0 };
}

function worktree(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/repo/feature',
    branch: 'feature/auth',
    files: [file('a.ts', 10, 4), file('b.ts', 2, 1)],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

describe('resolveWorktreeDiffCounts', () => {
  it('totals the working-tree files in working mode', () => {
    expect(resolveWorktreeDiffCounts(worktree(), 'working')).toEqual({
      fileCount: 2,
      linesAdded: 12,
      linesRemoved: 5,
    });
  });

  it('reports the branch diff, labelled with its base, in default-branch mode', () => {
    const wt = worktree({
      baseDiff: { base: 'main', fileCount: 7, linesAdded: 120, linesRemoved: 30 },
    });
    expect(resolveWorktreeDiffCounts(wt, 'defaultBranch')).toEqual({
      fileCount: 7,
      linesAdded: 120,
      linesRemoved: 30,
      comparedTo: 'main',
    });
  });

  it('ignores the branch diff when the counter is set to working changes', () => {
    const wt = worktree({
      baseDiff: { base: 'main', fileCount: 7, linesAdded: 120, linesRemoved: 30 },
    });
    expect(resolveWorktreeDiffCounts(wt, 'working').fileCount).toBe(2);
  });

  it('labels the counts with the PR base the host measured against', () => {
    const wt = worktree({
      baseDiff: { base: 'feature/part-2', fileCount: 3, linesAdded: 100, linesRemoved: 10 },
    });
    expect(resolveWorktreeDiffCounts(wt, 'defaultBranch').comparedTo).toBe('feature/part-2');
  });

  it('falls back to working changes when the host has no branch diff to show', () => {
    // A worktree on its base branch, or one whose stats haven't arrived yet.
    expect(resolveWorktreeDiffCounts(worktree({ branch: 'main' }), 'defaultBranch')).toEqual({
      fileCount: 2,
      linesAdded: 12,
      linesRemoved: 5,
    });
  });
});
