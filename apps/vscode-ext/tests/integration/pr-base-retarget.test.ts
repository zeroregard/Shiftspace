/**
 * A worktree is compared against the branch it merges into. For a stack of
 * pull requests that is the slice below it, not the repo's default branch —
 * which is what makes each worktree in the stack read as its own slice rather
 * than as the whole stack.
 *
 * The counts always follow the pull request. The inspection view's selector
 * follows too, but only while it is still pointing where Shiftspace put it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrStatus, WorktreeState, FileChange } from '@shiftspace/renderer';
import * as vscode from 'vscode';

vi.mock('child_process', () => ({ execFile: vi.fn() }));

vi.mock('../../src/git/status', () => ({
  getFileChanges: () => Promise.resolve([] as FileChange[]),
  getBranchDiffFileChanges: () => Promise.resolve([] as FileChange[]),
  getRepoFiles: () => Promise.resolve([] as FileChange[]),
}));

const getBranchDiffStats = vi.fn<(path: string, base: string) => Promise<Map<string, never>>>();

vi.mock('../../src/git/branch-stats', () => ({
  getBranchDiffStats: (p: string, b: string) => getBranchDiffStats(p, b),
  toDiffStats: () => ({ fileCount: 2, linesAdded: 100, linesRemoved: 10 }),
}));

vi.mock('../../src/git/worktrees', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/git/worktrees')>()),
  detectWorktrees: () =>
    Promise.resolve([
      {
        id: 'wt-1',
        path: '/repo/part-3',
        branch: 'stack/part-3',
        files: [],
        diffMode: { type: 'working' },
        defaultBranch: 'main',
        isMainWorktree: false,
        lastActivityAt: 0,
      } as WorktreeState,
    ]),
  checkGitAvailability: () => Promise.resolve('ok'),
  getDefaultBranch: () => Promise.resolve('main'),
  recoverStuckTempBranch: () => Promise.resolve(false),
}));

/** Capture the callbacks GitDataProvider hands the PR poller. */
let onPrStatus: ((worktreeId: string, status: PrStatus | undefined) => void) | undefined;

vi.mock('../../src/git-data-provider/pr-status-poller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/git-data-provider/pr-status-poller')>();
  return {
    ...actual,
    PrStatusPoller: class {
      constructor(cb: { onPrStatus: (id: string, s: PrStatus | undefined) => void }) {
        onPrStatus = cb.onPrStatus;
      }
      start() {}
      stop() {}
      dispose() {}
    },
  };
});

import { GitDataProvider } from '../../src/git-data-provider';

function openPr(baseRef: string): PrStatus {
  return {
    number: 7,
    url: 'https://github.com/acme/app/pull/7',
    state: 'open',
    baseRef,
    conflicts: false,
    approved: false,
    ciStatus: 'passing',
    fetchedAt: 0,
  };
}

/** Wait out the floating promises the PR callback kicks off. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  onPrStatus = undefined;
  getBranchDiffStats.mockReset();
  getBranchDiffStats.mockResolvedValue(new Map());
  (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'worktreeDiffCount' ? 'defaultBranch' : fallback
    ),
  }));
});

async function startProvider() {
  const posted: Array<Record<string, unknown>> = [];
  const provider = new GitDataProvider((m) => posted.push(m as Record<string, unknown>));
  await provider.switchRepo('/repo');
  posted.length = 0;
  return { provider, posted };
}

describe('following a pull request base', () => {
  it('measures the worktree against the PR base once the PR is known', async () => {
    const { provider } = await startProvider();
    const wt = provider.worktrees[0]!;
    expect(wt.baseDiff?.base).toBe('main');

    onPrStatus!('wt-1', openPr('stack/part-2'));
    await settle();

    expect(wt.baseDiff?.base).toBe('stack/part-2');
    expect(getBranchDiffStats).toHaveBeenLastCalledWith('/repo/part-3', 'stack/part-2');
    provider.dispose();
  });

  it('moves the branch comparison onto the PR base', async () => {
    const { provider } = await startProvider();
    const wt = provider.worktrees[0]!;
    wt.diffMode = { type: 'branch', branch: 'main' };

    onPrStatus!('wt-1', openPr('stack/part-2'));
    await settle();

    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'stack/part-2' });
    provider.dispose();
  });

  it('leaves a comparison the user picked themselves alone', async () => {
    const { provider } = await startProvider();
    const wt = provider.worktrees[0]!;
    await provider.handleSetDiffMode('wt-1', { type: 'branch', branch: 'develop' });

    onPrStatus!('wt-1', openPr('stack/part-2'));
    await settle();

    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'develop' });
    // The counts still follow — they are a measurement, not a choice.
    expect(wt.baseDiff?.base).toBe('stack/part-2');
    provider.dispose();
  });

  it('leaves the working-changes view alone', async () => {
    const { provider } = await startProvider();
    const wt = provider.worktrees[0]!;
    expect(wt.diffMode).toEqual({ type: 'working' });

    onPrStatus!('wt-1', openPr('stack/part-2'));
    await settle();

    expect(wt.diffMode).toEqual({ type: 'working' });
    provider.dispose();
  });

  it('goes back to the default branch when the PR merges', async () => {
    const { provider } = await startProvider();
    const wt = provider.worktrees[0]!;
    wt.diffMode = { type: 'branch', branch: 'main' };

    onPrStatus!('wt-1', openPr('stack/part-2'));
    await settle();
    onPrStatus!('wt-1', { ...openPr('stack/part-2'), state: 'merged' });
    await settle();

    expect(wt.baseDiff?.base).toBe('main');
    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'main' });
    provider.dispose();
  });
});
