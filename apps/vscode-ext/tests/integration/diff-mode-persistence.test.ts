/**
 * Regression tests for the inspection view's "vs {branch}" selector.
 *
 * Two behaviours are guarded here:
 *   1. A worktree opens on its working changes — comparing against the
 *      default branch is an explicit choice, never the starting point.
 *   2. Once the user picks a mode it survives a re-initialise (branch
 *      checkout, branch swap, repo refresh). Before this, re-init rebuilt
 *      every worktree from scratch and silently snapped the selector back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorktreeState, FileChange } from '@shiftspace/renderer';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

const getFileChangesMock = vi.fn<(path: string) => Promise<FileChange[]>>();
const getBranchDiffFileChangesMock =
  vi.fn<(path: string, branch: string) => Promise<FileChange[]>>();
const getRepoFilesMock = vi.fn<(path: string) => Promise<FileChange[]>>();

vi.mock('../../src/git/status', () => ({
  getFileChanges: (p: string) => getFileChangesMock(p),
  getBranchDiffFileChanges: (p: string, b: string) => getBranchDiffFileChangesMock(p, b),
  getRepoFiles: (p: string) => getRepoFilesMock(p),
}));

vi.mock('../../src/git/ignore-filter', () => ({
  filterIgnoredFiles: (files: FileChange[]) => files,
}));

const detectWorktreesMock = vi.fn<() => Promise<WorktreeState[]>>();

vi.mock('../../src/git/worktrees', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/git/worktrees')>()),
  detectWorktrees: () => detectWorktreesMock(),
  checkGitAvailability: () => Promise.resolve('ok'),
  getDefaultBranch: () => Promise.resolve('main'),
  recoverStuckTempBranch: () => Promise.resolve(false),
}));

vi.mock('../../src/git-data-provider/refresh', () => ({
  loadAllFileChanges: () => Promise.resolve(),
  refreshWorktree: () => Promise.resolve(),
  reloadAllWithFilter: () => Promise.resolve(),
}));

import { GitDataProvider } from '../../src/git-data-provider';

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/repo/wt-1',
    branch: 'feature/auth',
    files: [],
    branchFiles: undefined,
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

function makeProvider(worktrees: WorktreeState[]) {
  const postMessage = vi.fn();
  const provider = new GitDataProvider(postMessage);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional private-state seeding
  const p = provider as any;
  p.currentRoot = '/repo';
  p.worktrees = worktrees;
  return { provider, postMessage };
}

describe('diff-mode defaults and persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFileChangesMock.mockResolvedValue([]);
    getBranchDiffFileChangesMock.mockResolvedValue([]);
    getRepoFilesMock.mockResolvedValue([]);
  });

  it('starts every worktree on working changes, including feature branches', async () => {
    const feature = makeWt({ diffMode: { type: 'branch', branch: 'main' } });
    const main = makeWt({ id: 'wt-main', branch: 'main', path: '/repo', isMainWorktree: true });
    detectWorktreesMock.mockResolvedValue([feature, main]);

    const { provider } = makeProvider([]);
    await provider.reinitialize();

    expect(feature.diffMode).toEqual({ type: 'working' });
    expect(main.diffMode).toEqual({ type: 'working' });
  });

  it('restores a selected mode after a re-initialise', async () => {
    const wt = makeWt();
    detectWorktreesMock.mockResolvedValue([wt]);
    const { provider } = makeProvider([wt]);

    await provider.handleSetDiffMode('wt-1', { type: 'branch', branch: 'staging' });
    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'staging' });

    // A checkout / swap / refresh rebuilds the worktree list from git.
    await provider.reinitialize();

    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'staging' });
  });

  it('keeps persisted overrides applied across a re-initialise', async () => {
    const wt = makeWt();
    detectWorktreesMock.mockResolvedValue([wt]);
    const { provider } = makeProvider([wt]);

    await provider.applyDiffModeOverrides({ 'feature/auth': { type: 'repo' } });
    expect(wt.diffMode).toEqual({ type: 'repo' });

    await provider.reinitialize();

    expect(wt.diffMode).toEqual({ type: 'repo' });
  });

  it('drops the previous repo selections when switching repos', async () => {
    const wt = makeWt();
    detectWorktreesMock.mockResolvedValue([wt]);
    const { provider } = makeProvider([wt]);

    await provider.handleSetDiffMode('wt-1', { type: 'branch', branch: 'staging' });
    await provider.switchRepo('/other-repo', {});

    expect(wt.diffMode).toEqual({ type: 'working' });
  });
});
