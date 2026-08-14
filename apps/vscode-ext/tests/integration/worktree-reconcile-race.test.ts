/**
 * Regression tests for the worktree-deletion flicker.
 *
 * Symptom: delete worktree A (it disappears), then delete worktree B — A
 * briefly reappears before vanishing again.
 *
 * Cause: `checkForWorktreeChanges` diffed a `git worktree list` snapshot
 * against whatever the cached list happened to be *when the snapshot came
 * back*. A snapshot taken before a deletion but resolving after it shows the
 * deleted worktree as present while the cache no longer has it — so the
 * reconciler classified it as newly added and re-broadcast it, until the next
 * pass removed it again. Overlapping passes (3s poll + HEAD watcher + badge
 * watcher all call this) made the window easy to hit.
 *
 * Guards here:
 *   1. A deletion landing mid-detection never produces a `worktree-added`.
 *   2. Concurrent callers are coalesced into non-overlapping passes.
 *   3. A worktree git still lists as `prunable` (dir gone, record not yet
 *      pruned) is never treated as live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorktreeState } from '@shiftspace/renderer';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

const renameMock = vi.fn<(oldPath: string, newPath: string) => Promise<void>>();
const rmMock = vi.fn<(path: string, opts?: unknown) => Promise<void>>();

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      rename: (oldPath: string, newPath: string) => renameMock(oldPath, newPath),
      rm: (target: string, opts?: unknown) => rmMock(target, opts),
    },
  };
});

import { GitDataProvider } from '../../src/git-data-provider';
import { execFile } from 'child_process';

const ROOT = '/repo/primary';
const WT_A = '/repo/wt-a';
const WT_B = '/repo/wt-b';

/** Build `git worktree list --porcelain` output for the given worktree paths. */
function listOutput(paths: string[]): string {
  return (
    paths
      .map(
        (p, i) =>
          `worktree ${p}\nHEAD abc1234def567890abc1234def567890abc12345\nbranch refs/heads/${i === 0 ? 'main' : `feature/${p.split('/').pop()}`}\n`
      )
      .join('\n') + '\n'
  );
}

function stripArgs(args: string[]): string[] {
  return args[0] === '--no-optional-locks' ? args.slice(1) : args;
}

function isWorktreeList(args: string[]): boolean {
  const a = stripArgs(args);
  return a[0] === 'worktree' && a[1] === 'list';
}

/**
 * execFile stub whose `git worktree list` responses come from a queue of
 * producers. A producer may return a promise, letting a test hold a detection
 * open while it mutates state underneath it. Every other git command resolves
 * to empty output.
 */
function makeGit() {
  const listCalls: Array<() => void> = [];
  let listResponses: Array<() => string | Promise<string>> = [];
  let defaultList = '';

  vi.mocked(execFile).mockImplementation(((
    _cmd: string,
    args: string[],
    _opts: unknown,
    cb: (err: unknown, res: { stdout: string; stderr: string }) => void
  ) => {
    if (!isWorktreeList(args)) {
      cb(null, { stdout: '', stderr: '' });
      return;
    }
    const producer = listResponses.shift() ?? (() => defaultList);
    void Promise.resolve(producer()).then((stdout) => cb(null, { stdout, stderr: '' }));
    listCalls.push(() => {});
  }) as never);

  return {
    get listCallCount() {
      return listCalls.length;
    },
    /** Queue per-call `worktree list` responses, consumed in order. */
    queueList(...producers: Array<() => string | Promise<string>>) {
      listResponses = producers;
    },
    /** Response for any `worktree list` call past the queued ones. */
    setDefaultList(output: string) {
      defaultList = output;
    },
  };
}

function makeWt(path: string, overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: path,
    path,
    branch: `feature/${path.split('/').pop()}`,
    files: [],
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional private-state seeding for a focused test
  const p = provider as any;
  p.currentRoot = ROOT;
  p.worktrees = worktrees;
  return { provider, postMessage };
}

/** Every worktree lifecycle event the provider posted, in order. */
function lifecycleEvents(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls
    .map((c) => c[0] as { type?: string; event?: { type?: string; worktreeId?: string } })
    .filter((m) => m.type === 'event' && m.event?.type?.startsWith('worktree-'))
    .map((m) => `${m.event!.type}:${m.event!.worktreeId ?? ''}`);
}

/** A promise plus its resolver, for holding a git call open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('worktree reconciliation races', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renameMock.mockReset().mockResolvedValue(undefined);
    rmMock.mockReset().mockResolvedValue(undefined);
  });

  it('does not re-add a worktree deleted while a detection was in flight', async () => {
    const git = makeGit();
    const gate = deferred<void>();
    // First detection observes the pre-deletion world and stays open until we
    // release it; every later one sees A gone.
    git.queueList(async () => {
      await gate.promise;
      return listOutput([ROOT, WT_A, WT_B]);
    });
    git.setDefaultList(listOutput([ROOT, WT_B]));

    const { provider, postMessage } = makeProvider([
      makeWt(ROOT, { branch: 'main', isMainWorktree: true }),
      makeWt(WT_A),
      makeWt(WT_B),
    ]);

    const pass = provider.checkForWorktreeChanges();
    await provider.handleRemoveWorktree(WT_A);
    gate.resolve();
    await pass;

    expect(lifecycleEvents(postMessage)).toEqual([
      'worktree-removal-pending:/repo/wt-a',
      'worktree-removed:/repo/wt-a',
    ]);
    expect(provider.getFullWorktrees().map((wt) => wt.id)).toEqual([ROOT, WT_B]);
    // The stale snapshot was discarded and detection re-run.
    expect(git.listCallCount).toBe(2);
  });

  it('coalesces concurrent reconcile requests instead of overlapping passes', async () => {
    const git = makeGit();
    const gate = deferred<void>();
    let concurrent = 0;
    let maxConcurrent = 0;
    git.queueList(
      async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await gate.promise;
        concurrent--;
        return listOutput([ROOT, WT_B]);
      },
      () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        concurrent--;
        return listOutput([ROOT, WT_B]);
      }
    );
    git.setDefaultList(listOutput([ROOT, WT_B]));

    const { provider, postMessage } = makeProvider([
      makeWt(ROOT, { branch: 'main', isMainWorktree: true }),
      makeWt(WT_B),
    ]);

    const first = provider.checkForWorktreeChanges();
    const second = provider.checkForWorktreeChanges();
    const third = provider.checkForWorktreeChanges();
    gate.resolve();
    await Promise.all([first, second, third]);

    expect(maxConcurrent).toBe(1);
    // One pass for the first caller, one more covering the two that arrived
    // while it was running.
    expect(git.listCallCount).toBe(2);
    expect(lifecycleEvents(postMessage)).toEqual([]);
  });

  it('ignores worktrees git still lists as prunable', async () => {
    const git = makeGit();
    git.setDefaultList(
      listOutput([ROOT, WT_B]) +
        `\nworktree ${WT_A}\nHEAD abc1234def567890abc1234def567890abc12345\nbranch refs/heads/feature/wt-a\nprunable gitdir file points to non-existent location\n`
    );

    const { provider, postMessage } = makeProvider([
      makeWt(ROOT, { branch: 'main', isMainWorktree: true }),
      makeWt(WT_B),
    ]);

    await provider.checkForWorktreeChanges();

    expect(lifecycleEvents(postMessage)).toEqual([]);
    expect(provider.getFullWorktrees().map((wt) => wt.id)).toEqual([ROOT, WT_B]);
  });

  it('keeps cached files for worktrees a reconcile pass leaves untouched', async () => {
    const git = makeGit();
    git.setDefaultList(listOutput([ROOT, WT_B]));

    const file = {
      path: 'src/app.ts',
      status: 'modified' as const,
      staged: false,
      linesAdded: 3,
      linesRemoved: 1,
      lastChangedAt: 1_700_000_000_000,
    };
    const { provider } = makeProvider([
      makeWt(ROOT, { branch: 'main', isMainWorktree: true }),
      makeWt(WT_B, { files: [file] }),
    ]);

    await provider.checkForWorktreeChanges();

    expect(provider.getWorktreeFiles(WT_B)).toEqual([file]);
  });
});
