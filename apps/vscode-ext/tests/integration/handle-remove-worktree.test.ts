/**
 * Integration-style test for GitDataProvider.handleRemoveWorktree.
 *
 * Guards the full lifecycle:
 *   1. removeWorktree is invoked with the PRIMARY repo root (gitRoot), not
 *      the path of the worktree being deleted. This is the exact regression
 *      PR #131 fixed — running git inside a dir that's about to be deleted
 *      interacts badly with filesystem watchers. Reverting `this.currentRoot!`
 *      to `wt.path` must fail this test.
 *   2. pending → removed events are emitted on success.
 *   3. First attempt fails → retries with `--force`, still reports success.
 *   4. Both attempts fail → emits `worktree-removal-failed`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorktreeState } from '@shiftspace/renderer';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

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

/** Filter to only the `git worktree remove` calls — ignores background reconciliation. */
function worktreeRemoveCalls(calls: ExecFileCall[]): ExecFileCall[] {
  return calls.filter((c) => {
    const stripped = c.args[0] === '--no-optional-locks' ? c.args.slice(1) : c.args;
    return stripped[0] === 'worktree' && stripped[1] === 'remove';
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
  });

  it('runs `git worktree remove` with cwd === currentRoot (not the worktree path)', async () => {
    const mock = makeExecFileMock();
    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('wt-1', { path: '/repo/primary/../wt-1' })],
    });

    await provider.handleRemoveWorktree('wt-1');

    const removeCalls = worktreeRemoveCalls(mock.calls);
    expect(removeCalls.length).toBeGreaterThanOrEqual(1);
    // Every remove call must target the primary root, not the worktree path.
    for (const c of removeCalls) {
      expect(c.opts.cwd).toBe('/repo/primary');
      expect(c.args).toContain('/repo/primary/../wt-1');
    }

    // pending + removed events emitted in order
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

  it('retries with --force when the first remove fails, then reports success', async () => {
    const mock = makeExecFileMock();
    let removeAttempt = 0;
    mock.setSequencer((call) => {
      const stripped = call.args[0] === '--no-optional-locks' ? call.args.slice(1) : call.args;
      if (stripped[0] === 'worktree' && stripped[1] === 'remove') {
        removeAttempt++;
        if (removeAttempt === 1) return { error: new Error('contains modified files') };
        return { stdout: '' };
      }
      return { stdout: '' };
    });

    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('wt-1')],
    });

    await provider.handleRemoveWorktree('wt-1');

    const removeCalls = worktreeRemoveCalls(mock.calls);
    expect(removeCalls).toHaveLength(2);
    // First attempt without --force, second with --force.
    expect(removeCalls[0]?.args).not.toContain('--force');
    expect(removeCalls[1]?.args).toContain('--force');
    // Both attempts must use the primary root.
    for (const c of removeCalls) expect(c.opts.cwd).toBe('/repo/primary');

    const eventTypes = postMessage.mock.calls
      .map((c) => c[0] as { type?: string; event?: { type?: string } })
      .filter((m) => m.type === 'event')
      .map((m) => m.event?.type);
    expect(eventTypes).toContain('worktree-removed');
    expect(eventTypes).not.toContain('worktree-removal-failed');
  });

  it('emits worktree-removal-failed when both attempts fail', async () => {
    makeExecFileMock().setSequencer((call) => {
      const stripped = call.args[0] === '--no-optional-locks' ? call.args.slice(1) : call.args;
      if (stripped[0] === 'worktree' && stripped[1] === 'remove') {
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

  it('refuses to remove the primary worktree', async () => {
    const mock = makeExecFileMock();
    const { provider, postMessage } = makeProvider({
      currentRoot: '/repo/primary',
      worktrees: [makeWt('main', { isMainWorktree: true })],
    });

    await provider.handleRemoveWorktree('main');

    expect(worktreeRemoveCalls(mock.calls)).toHaveLength(0);
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

    expect(worktreeRemoveCalls(mock.calls)).toHaveLength(0);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
