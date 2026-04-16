/**
 * Integration test for GitDataProvider.applyDiffModeOverrides.
 *
 * Guards the invariant that `wt.diffMode` and `wt.branchFiles` on the shared
 * worktree state are always updated ATOMICALLY. A late-registering view
 * (e.g. a second webview, or the panel reopening) must never see an override
 * branch diffMode paired with undefined/stale branchFiles — that mismatch is
 * what produced the "inspection view shows nothing despite the selector
 * saying 'vs staging'" regression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorktreeState, FileChange } from '@shiftspace/renderer';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('../../src/telemetry', () => ({
  reportError: vi.fn(),
  reportUnexpectedState: vi.fn(),
}));

// Stub the git status helpers so we control exactly what applyDiffModeOverrides
// observes per mode, and we can introduce controlled delays to exercise the
// fetch-then-commit ordering.
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

import { GitDataProvider } from '../../src/git-data-provider';

function makeFile(path: string, overrides: Partial<FileChange> = {}): FileChange {
  return {
    path,
    status: 'modified',
    staged: false,
    linesAdded: 1,
    linesRemoved: 0,
    lastChangedAt: 0,
    ...overrides,
  };
}

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/repo/wt-1',
    branch: 'feature/auth',
    files: [makeFile('src/existing.ts')],
    branchFiles: undefined,
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

function makeProvider(opts: { worktrees: WorktreeState[] }) {
  const postMessage = vi.fn();
  const provider = new GitDataProvider(postMessage);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional private-state seeding
  const p = provider as any;
  p.currentRoot = '/repo';
  p.worktrees = opts.worktrees;
  return { provider, postMessage };
}

describe('GitDataProvider.applyDiffModeOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFileChangesMock.mockResolvedValue([]);
    getBranchDiffFileChangesMock.mockResolvedValue([]);
    getRepoFilesMock.mockResolvedValue([]);
  });

  it('awaits the branch-diff fetch before mutating wt.diffMode + wt.branchFiles', async () => {
    // Make the branch-diff fetch hang until we release it. While it's
    // pending, the shared worktree state must remain consistent — any view
    // that inspects the worktrees mid-flight must see the OLD mode, not the
    // new mode with undefined branchFiles.
    let releaseBranchFetch!: (files: FileChange[]) => void;
    getBranchDiffFileChangesMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseBranchFetch = resolve;
        })
    );

    const wt = makeWt({ diffMode: { type: 'working' }, branchFiles: undefined });
    const { provider, postMessage } = makeProvider({ worktrees: [wt] });

    const applyPromise = provider.applyDiffModeOverrides({
      'feature/auth': { type: 'branch', branch: 'main' },
    });

    // Yield to microtasks so the fetch starts.
    await Promise.resolve();
    await Promise.resolve();

    // INVARIANT: while the fetch is in flight, the worktree snapshot must
    // still be in its original consistent state — diffMode AND branchFiles
    // unchanged together. This is what protects a late-registering view
    // from receiving an `init` message with a mismatched pair.
    expect(wt.diffMode).toEqual({ type: 'working' });
    expect(wt.branchFiles).toBeUndefined();
    expect(postMessage).not.toHaveBeenCalled();

    // Release the fetch and wait for applyDiffModeOverrides to resolve.
    const branchFiles = [makeFile('src/committed.ts', { status: 'added', linesAdded: 10 })];
    releaseBranchFetch(branchFiles);
    await applyPromise;

    // After the fetch, diffMode + branchFiles commit together.
    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'main' });
    expect(wt.branchFiles).toEqual(branchFiles);

    // The worktree-files-updated message carries the new mode AND the
    // freshly-fetched branchFiles in a single payload.
    const updates = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; diffMode?: unknown; branchFiles?: unknown })
      .filter((m) => m.type === 'worktree-files-updated');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.diffMode).toEqual({ type: 'branch', branch: 'main' });
    expect(updates[0]?.branchFiles).toEqual(branchFiles);
  });

  it('skips worktrees whose diffMode already matches the override', async () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('src/committed.ts')],
    });
    const { provider, postMessage } = makeProvider({ worktrees: [wt] });

    await provider.applyDiffModeOverrides({
      'feature/auth': { type: 'branch', branch: 'main' },
    });

    expect(getBranchDiffFileChangesMock).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty override map', async () => {
    const wt = makeWt();
    const { provider, postMessage } = makeProvider({ worktrees: [wt] });

    await provider.applyDiffModeOverrides({});

    expect(getBranchDiffFileChangesMock).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('applies overrides for multiple worktrees concurrently', async () => {
    const wtA = makeWt({
      id: 'wt-a',
      branch: 'feature/a',
      path: '/repo/wt-a',
      diffMode: { type: 'working' },
    });
    const wtB = makeWt({
      id: 'wt-b',
      branch: 'feature/b',
      path: '/repo/wt-b',
      diffMode: { type: 'working' },
    });
    const { provider, postMessage } = makeProvider({ worktrees: [wtA, wtB] });

    getBranchDiffFileChangesMock.mockResolvedValue([makeFile('src/x.ts')]);

    await provider.applyDiffModeOverrides({
      'feature/a': { type: 'branch', branch: 'main' },
      'feature/b': { type: 'branch', branch: 'main' },
    });

    expect(wtA.diffMode).toEqual({ type: 'branch', branch: 'main' });
    expect(wtA.branchFiles).toBeDefined();
    expect(wtB.diffMode).toEqual({ type: 'branch', branch: 'main' });
    expect(wtB.branchFiles).toBeDefined();

    const updates = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; worktreeId?: string })
      .filter((m) => m.type === 'worktree-files-updated');
    expect(updates).toHaveLength(2);
    expect(updates.map((u) => u.worktreeId).sort()).toEqual(['wt-a', 'wt-b']);
  });

  it('recovers from branch-diff fetch errors without leaving state inconsistent', async () => {
    getBranchDiffFileChangesMock.mockRejectedValueOnce(new Error('fatal: unknown revision'));

    const wt = makeWt({ diffMode: { type: 'working' }, branchFiles: undefined });
    const { provider, postMessage } = makeProvider({ worktrees: [wt] });

    await provider.applyDiffModeOverrides({
      'feature/auth': { type: 'branch', branch: 'missing-branch' },
    });

    // On error we leave the worktree untouched — better than half-applying.
    expect(wt.diffMode).toEqual({ type: 'working' });
    expect(wt.branchFiles).toBeUndefined();
    const updates = postMessage.mock.calls
      .map((c) => c[0] as { type?: string })
      .filter((m) => m.type === 'worktree-files-updated');
    expect(updates).toHaveLength(0);
  });
});
