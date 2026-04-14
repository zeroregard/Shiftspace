/**
 * Integration-style test for GitDataProvider.handleRemoveWorktree.
 *
 * Guards the full lifecycle:
 *   1. The fast path renames the worktree dir and runs `git worktree prune`
 *      from the PRIMARY repo root (gitRoot), not the path of the worktree
 *      being deleted. This is the regression PR #131 originally fixed —
 *      running git inside a dir that's about to be deleted interacts badly
 *      with filesystem watchers.
 *   2. pending → removed events are emitted on success.
 *   3. When rename fails (cross-volume, missing dir, etc.) we fall back to
 *      `git worktree remove --force` and still report success.
 *   4. When the fallback also fails, emits `worktree-removal-failed`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorktreeState } from '@shiftspace/renderer';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// fs.promises is used for the rename + background rm. We stub it so the
// rename is deterministic (success or failure) and the background rm is a
// no-op that resolves immediately.
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

// git-data-provider pulls in many peripheral modules via side imports; stub the
// ones that do real work (fs-based ignore filter, diagnostics) so tests stay pure.
vi.mock('../../src/telemetry', () => ({
  reportError: vi.fn(),
  reportUnexpectedState: vi.fn(),
}));

import { GitDataProvider } from '../../src/git-data-provider';
import { execFile } from 'child_process';

type ExecFileCall = { cmd: string; args: string[]; opts: { cwd?: string } };

function makeExecFileMock() {
  const calls: ExecFileCall[] = [];
  let sequencer:
    | ((call: ExecFileCall) => { stdout?: string; stderr?: string; error?: Error })
    | null = null;

  const impl = (cmd: unknown, args: unknown, opts: unknown, cb: Function) => {
    const call: ExecFileCall = {
      cmd: String(cmd),
      args: args as string[],
      opts: opts as { cwd?: string },
    };
    calls.push(call);
    const resp = sequencer ? sequencer(call) : { stdout: '' };
    if (resp.error) {
      cb(Object.assign(resp.error, { stderr: '' }), { stdout: '', stderr: '' });
    } else {
      cb(null, { stdout: resp.stdout ?? '', stderr: resp.stderr ?? '' });
    }
  };

  vi.mocked(execFile).mockImplementation(impl as any);

  return {
    calls,
    setSequencer(fn: typeof sequencer) {
      sequencer = fn;
    },
  };
}

/** Normalise a git arg list, stripping the `--no-optional-locks` prefix used by read paths. */
function stripArgs(args: string[]): string[] {
  return args[0] === '--no-optional-locks' ? args.slice(1) : args;
}

/** Filter to `git worktree <subcommand>` calls matching the given subcommand. */
function worktreeCalls(calls: ExecFileCall[], subcommand: string): ExecFileCall[] {
  return calls.filter((c) => {
    const stripped = stripArgs(c.args);
    return stripped[0] === 'worktree' && stripped[1] === subcommand;
  });
}

function makeWt(id: string, overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id,
    path: `/repo/${id}`,
    branch: `feature/${id}`,
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

/**
 * Seed a GitDataProvider without going through switchRepo (which kicks off
 * full filesystem watcher setup). We only need the state that handleRemoveWorktree
 * reads: worktrees list + currentRoot.
 */
function makeProvider(opts: { currentRoot: string; worktrees: WorktreeState[] }) {
  const postMessage = vi.fn();
  const provider = new GitDataProvider(postMessage);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional private-state seeding for focused unit test
  const p = provider as any;
  p.currentRoot = opts.currentRoot;
  p.worktrees = opts.worktrees;
  return { provider, postMessage };
}

describe('GitDataProvider.handleRemoveWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renameMock.mockReset();
    rmMock.mockReset();
    // Default: rename and rm both succeed.
    renameMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
  });

  it('fast path: renames worktree dir, prunes from primary root, then background-rms the temp dir', async () => {
    const mock = makeExecFileMock();
    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('wt-1', { path: '/repo/primary/../wt-1' })],
    });

    await provider.handleRemoveWorktree('wt-1');

    // Rename was called on the worktree path.
    expect(renameMock).toHaveBeenCalledTimes(1);
    const [renameFrom, renameTo] = renameMock.mock.calls[0]!;
    expect(renameFrom).toBe('/repo/primary/../wt-1');
    expect(renameTo.startsWith('/repo/primary/../wt-1.deleting-')).toBe(true);

    // `git worktree prune` ran with cwd === primary root.
    const pruneCalls = worktreeCalls(mock.calls, 'prune');
    expect(pruneCalls).toHaveLength(1);
    expect(pruneCalls[0]?.opts.cwd).toBe('/repo/primary');

    // No `git worktree remove` call on the fast path.
    expect(worktreeCalls(mock.calls, 'remove')).toHaveLength(0);

    // Background rm targets the same renamed path.
    expect(rmMock).toHaveBeenCalledTimes(1);
    expect(rmMock.mock.calls[0]![0]).toBe(renameTo);

    // pending + removed events emitted in order.
    const eventMessages = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; event?: { type?: string } })
      .filter((m) => m.type === 'event')
      .map((m) => m.event?.type);
    expect(eventMessages).toContain('worktree-removal-pending');
    expect(eventMessages).toContain('worktree-removed');
    expect(eventMessages).not.toContain('worktree-removal-failed');
    const pendingIdx = eventMessages.indexOf('worktree-removal-pending');
    const removedIdx = eventMessages.indexOf('worktree-removed');
    expect(pendingIdx).toBeLessThan(removedIdx);
  });

  it('falls back to `git worktree remove --force` when the rename fails', async () => {
    const mock = makeExecFileMock();
    renameMock.mockRejectedValueOnce(new Error('EXDEV: cross-device link not permitted'));

    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('wt-1')],
    });

    await provider.handleRemoveWorktree('wt-1');

    const removeCalls = worktreeCalls(mock.calls, 'remove');
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]?.args).toContain('--force');
    expect(removeCalls[0]?.opts.cwd).toBe('/repo/primary');
    expect(removeCalls[0]?.args).toContain('/repo/wt-1');

    // No prune on the fallback path — the remove command handles metadata itself.
    expect(worktreeCalls(mock.calls, 'prune')).toHaveLength(0);
    expect(rmMock).not.toHaveBeenCalled();

    const eventTypes = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; event?: { type?: string } })
      .filter((m) => m.type === 'event')
      .map((m) => m.event?.type);
    expect(eventTypes).toContain('worktree-removed');
    expect(eventTypes).not.toContain('worktree-removal-failed');
  });

  it('emits worktree-removal-failed when rename fails AND the fallback remove fails', async () => {
    renameMock.mockRejectedValueOnce(new Error('ENOENT'));
    makeExecFileMock().setSequencer((call) => {
      if (stripArgs(call.args)[0] === 'worktree' && stripArgs(call.args)[1] === 'remove') {
        return { error: new Error('permission denied') };
      }
      return { stdout: '' };
    });

    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('wt-1')],
    });

    await provider.handleRemoveWorktree('wt-1');

    const eventTypes = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; event?: { type?: string } })
      .filter((m) => m.type === 'event')
      .map((m) => m.event?.type);
    expect(eventTypes).toContain('worktree-removal-pending');
    expect(eventTypes).toContain('worktree-removal-failed');
    expect(eventTypes).not.toContain('worktree-removed');
    const pendingIdx = eventTypes.indexOf('worktree-removal-pending');
    const failedIdx = eventTypes.indexOf('worktree-removal-failed');
    expect(pendingIdx).toBeLessThan(failedIdx);
  });

  it('still reports success when the prune step fails (best-effort cleanup)', async () => {
    makeExecFileMock().setSequencer((call) => {
      if (stripArgs(call.args)[0] === 'worktree' && stripArgs(call.args)[1] === 'prune') {
        return { error: new Error('prune failed') };
      }
      return { stdout: '' };
    });

    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('wt-1')],
    });

    await provider.handleRemoveWorktree('wt-1');

    // Background rm still runs.
    expect(rmMock).toHaveBeenCalledTimes(1);

    const eventTypes = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; event?: { type?: string } })
      .filter((m) => m.type === 'event')
      .map((m) => m.event?.type);
    expect(eventTypes).toContain('worktree-removed');
    expect(eventTypes).not.toContain('worktree-removal-failed');
  });

  it('refuses to remove the primary worktree', async () => {
    const mock = makeExecFileMock();
    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('main', { isMainWorktree: true })],
    });

    await provider.handleRemoveWorktree('main');

    expect(worktreeCalls(mock.calls, 'remove')).toHaveLength(0);
    expect(worktreeCalls(mock.calls, 'prune')).toHaveLength(0);
    expect(renameMock).not.toHaveBeenCalled();
    const eventTypes = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; event?: { type?: string } })
      .filter((m) => m.type === 'event')
      .map((m) => m.event?.type);
    expect(eventTypes).not.toContain('worktree-removal-pending');
    expect(eventTypes).not.toContain('worktree-removed');
  });

  it('is a no-op for an unknown worktree id', async () => {
    const mock = makeExecFileMock();
    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('wt-1')],
    });

    await provider.handleRemoveWorktree('does-not-exist');

    expect(worktreeCalls(mock.calls, 'remove')).toHaveLength(0);
    expect(worktreeCalls(mock.calls, 'prune')).toHaveLength(0);
    expect(renameMock).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
