import { describe, it, expect } from 'vitest';
import type { WorktreeState } from '@shiftspace/renderer';
import { isAutoDeletableWorktree } from '../../src/git-data-provider/auto-delete';

function wt(branch: string, isMainWorktree = false): WorktreeState {
  return {
    id: `/repo/${branch}`,
    path: `/repo/${branch}`,
    branch,
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree,
    lastActivityAt: 0,
  } as WorktreeState;
}

describe('isAutoDeletableWorktree', () => {
  it('accepts a feature branch', () => {
    expect(isAutoDeletableWorktree(wt('feature/login'), 'main')).toBe(true);
  });

  it('rejects the default branch', () => {
    expect(isAutoDeletableWorktree(wt('main'), 'main')).toBe(false);
    expect(isAutoDeletableWorktree(wt('master'), 'master')).toBe(false);
    expect(isAutoDeletableWorktree(wt('develop'), 'develop')).toBe(false);
  });

  it('rejects the default branch however either name is qualified', () => {
    expect(isAutoDeletableWorktree(wt('refs/heads/main'), 'main')).toBe(false);
    expect(isAutoDeletableWorktree(wt('main'), 'origin/main')).toBe(false);
    expect(isAutoDeletableWorktree(wt('main'), 'refs/remotes/origin/main')).toBe(false);
  });

  it('rejects the primary worktree even on a feature branch', () => {
    expect(isAutoDeletableWorktree(wt('feature/login', true), 'main')).toBe(false);
  });

  it('rejects a worktree with no branch of its own', () => {
    expect(isAutoDeletableWorktree(wt('1a2b3c4d'), 'main')).toBe(false);
    expect(isAutoDeletableWorktree(wt('HEAD'), 'main')).toBe(false);
    expect(isAutoDeletableWorktree(wt(''), 'main')).toBe(false);
  });

  it('keeps a branch that merely starts with the default branch name', () => {
    expect(isAutoDeletableWorktree(wt('main-cleanup'), 'main')).toBe(true);
    expect(isAutoDeletableWorktree(wt('feature/main'), 'main')).toBe(true);
  });
});
