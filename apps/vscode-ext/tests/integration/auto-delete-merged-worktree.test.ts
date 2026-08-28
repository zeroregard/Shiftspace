/**
 * A merged pull request finishes a feature branch — never the branch it merged
 * into. With auto-delete turned on, only feature-branch worktrees are removed:
 * the primary worktree, a worktree sitting on the repo's default branch, and a
 * worktree with no branch of its own are all kept.
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

vi.mock('../../src/git/branch-stats', () => ({
  getBranchDiffStats: () => Promise.resolve(new Map()),
  toDiffStats: () => ({ fileCount: 0, linesAdded: 0, linesRemoved: 0 }),
}));

function worktree(overrides: Partial<WorktreeState>): WorktreeState {
  return {
    id: overrides.path ?? '/repo',
    path: '/repo',
    branch: 'main',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  } as WorktreeState;
}

const WORKTREES: WorktreeState[] = [
  worktree({ path: '/repo', branch: 'main', isMainWorktree: true }),
  worktree({ path: '/repo/feature', branch: 'feature/login' }),
  worktree({ path: '/repo/release', branch: 'main' }),
  worktree({ path: '/repo/detached', branch: '1a2b3c4d' }),
];

vi.mock('../../src/git/worktrees', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/git/worktrees')>()),
  detectWorktrees: () => Promise.resolve(WORKTREES.map((w) => ({ ...w }))),
  checkGitAvailability: () => Promise.resolve('ok'),
  getDefaultBranch: () => Promise.resolve('main'),
  recoverStuckTempBranch: () => Promise.resolve(false),
}));

/** Capture the callback GitDataProvider hands the PR poller. */
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

function mergedPr(): PrStatus {
  return {
    number: 7,
    url: 'https://github.com/acme/app/pull/7',
    state: 'merged',
    baseRef: 'main',
    conflicts: false,
    approved: true,
    ciStatus: 'passing',
    fetchedAt: 0,
  };
}

/** Wait out the floating promises the PR callback kicks off. */
const settle = () => new Promise((r) => setTimeout(r, 0));

let autoDeleteEnabled = true;

beforeEach(() => {
  onPrStatus = undefined;
  autoDeleteEnabled = true;
  (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'pr.autoDeleteMergedWorktrees' ? autoDeleteEnabled : fallback
    ),
  }));
});

async function startProvider() {
  const provider = new GitDataProvider(() => {});
  await provider.switchRepo('/repo');
  const removed = vi
    .spyOn(provider, 'handleRemoveWorktree')
    .mockImplementation(() => Promise.resolve());
  return { provider, removed };
}

describe('auto-deleting a worktree whose PR merged', () => {
  it('removes a worktree on a feature branch', async () => {
    const { provider, removed } = await startProvider();

    onPrStatus!('/repo/feature', mergedPr());
    await settle();

    expect(removed).toHaveBeenCalledWith('/repo/feature');
    provider.dispose();
  });

  it('keeps a worktree that has the default branch checked out', async () => {
    const { provider, removed } = await startProvider();

    onPrStatus!('/repo/release', mergedPr());
    await settle();

    expect(removed).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('keeps the primary worktree', async () => {
    const { provider, removed } = await startProvider();

    onPrStatus!('/repo', mergedPr());
    await settle();

    expect(removed).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('keeps a worktree with no branch checked out', async () => {
    const { provider, removed } = await startProvider();

    onPrStatus!('/repo/detached', mergedPr());
    await settle();

    expect(removed).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('keeps a default-branch worktree even after repeated polls', async () => {
    const { provider, removed } = await startProvider();

    onPrStatus!('/repo/release', mergedPr());
    onPrStatus!('/repo/release', mergedPr());
    await settle();

    expect(removed).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('removes nothing while the setting is off', async () => {
    autoDeleteEnabled = false;
    const { provider, removed } = await startProvider();

    onPrStatus!('/repo/feature', mergedPr());
    await settle();

    expect(removed).not.toHaveBeenCalled();
    provider.dispose();
  });
});
