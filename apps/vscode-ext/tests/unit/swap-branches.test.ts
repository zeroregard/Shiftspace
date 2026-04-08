import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { swapBranches, checkWorktreeSafety } from '../../src/git/worktrees';
import { execFile } from 'child_process';

// Helpers

function mockSuccess(stdout = '') {
  return (_cmd: unknown, _args: unknown, _opts: unknown, cb: Function) => {
    cb(null, { stdout, stderr: '' });
  };
}

function mockError(message: string, code?: number | string) {
  return (_cmd: unknown, _args: unknown, _opts: unknown, cb: Function) => {
    cb(Object.assign(new Error(message), { code }), { stdout: '', stderr: '' });
  };
}

/** Build a mock that returns different responses for successive calls. */
function mockSequence(responses: Array<{ stdout?: string; error?: string }>) {
  let i = 0;
  return (_cmd: unknown, args: unknown, _opts: unknown, cb: Function) => {
    const resp = responses[i++] ?? { stdout: '' };
    if (resp.error) {
      cb(new Error(resp.error), { stdout: '', stderr: '' });
    } else {
      cb(null, { stdout: resp.stdout ?? '', stderr: '' });
    }
  };
}

/**
 * Strip the --no-optional-locks flag that gitReadOnly prepends.
 * Write commands (gitWrite) do not add this flag, so their args are unchanged.
 */
function normalizeGitArgs(args: string[]): string[] {
  return args[0] === '--no-optional-locks' ? args.slice(1) : args;
}

// checkWorktreeSafety

describe('checkWorktreeSafety', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when everything is clean', async () => {
    // symbolic-ref succeeds (on a branch), MERGE_HEAD missing, REBASE_HEAD missing, no conflicts
    vi.mocked(execFile).mockImplementation(
      mockSequence([
        { stdout: 'refs/heads/feature/auth' }, // symbolic-ref
        { error: 'not found' }, // MERGE_HEAD — not found = not merging
        { error: 'not found' }, // REBASE_HEAD — not found = not rebasing
        { stdout: '' }, // diff --diff-filter=U (no conflicts)
      ]) as any
    );

    const result = await checkWorktreeSafety('/some/worktree');
    expect(result).toBeNull();
  });

  it('returns error when in detached HEAD', async () => {
    vi.mocked(execFile).mockImplementation(mockError('not a branch', 1) as any);
    const result = await checkWorktreeSafety('/some/worktree');
    expect(result).toMatch(/detached HEAD/);
  });

  it('returns error when merge is in progress', async () => {
    vi.mocked(execFile).mockImplementation(
      mockSequence([
        { stdout: 'refs/heads/feature/auth' }, // symbolic-ref — on a branch
        { stdout: 'abc1234' }, // MERGE_HEAD exists = merge in progress
      ]) as any
    );
    const result = await checkWorktreeSafety('/some/worktree');
    expect(result).toMatch(/merge is in progress/);
  });

  it('returns error when rebase is in progress', async () => {
    vi.mocked(execFile).mockImplementation(
      mockSequence([
        { stdout: 'refs/heads/feature/auth' }, // symbolic-ref
        { error: 'not found' }, // MERGE_HEAD missing
        { stdout: 'abc1234' }, // REBASE_HEAD exists = rebase in progress
      ]) as any
    );
    const result = await checkWorktreeSafety('/some/worktree');
    expect(result).toMatch(/rebase is in progress/);
  });

  it('returns error when there are merge conflicts', async () => {
    vi.mocked(execFile).mockImplementation(
      mockSequence([
        { stdout: 'refs/heads/feature/auth' }, // symbolic-ref
        { error: 'not found' }, // no MERGE_HEAD
        { error: 'not found' }, // no REBASE_HEAD
        { stdout: 'src/conflict.ts\n' }, // unmerged files
      ]) as any
    );
    const result = await checkWorktreeSafety('/some/worktree');
    expect(result).toMatch(/merge conflicts/);
    expect(result).toContain('src/conflict.ts');
  });
});

// swapBranches — shared helpers

const DEFAULT_SWAP_OPTS = {
  worktreeAPath: '/wt/feature',
  branchA: 'feature/auth',
  worktreeBPath: '/wt/main',
  branchB: 'main',
};

type MockResult = { stdout: string; stderr: string } | { error: string };

/** Set up a recording mock that tracks all git calls and returns joined strings for assertions. */
function recordingMock(
  handler?: (args: string[], calls: Array<string[]>) => MockResult | undefined
) {
  const calls: Array<string[]> = [];
  vi.mocked(execFile).mockImplementation(((
    _cmd: unknown,
    rawArgs: string[],
    _opts: unknown,
    cb: Function
  ) => {
    const args = normalizeGitArgs(rawArgs);
    calls.push(args);
    const custom = handler?.(args, calls);
    if (custom && 'error' in custom) {
      cb(new Error(custom.error), { stdout: '', stderr: '' });
      return;
    }
    if (custom) {
      cb(null, custom);
      return;
    }
    cb(null, { stdout: '', stderr: '' });
  }) as any);
  return { calls, joined: () => calls.map((a) => a.join(' ')) };
}

// swapBranches — happy path: clean swap

describe('swapBranches — clean swap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs the full swap sequence when neither worktree has changes', async () => {
    const { joined } = recordingMock();
    await swapBranches(DEFAULT_SWAP_OPTS);
    const j = joined();
    expect(j).toContain('status --porcelain');
    expect(j.find((c) => c.startsWith('checkout -b _shiftspace_temp_swap'))).toBeDefined();
    expect(j).toContain('checkout feature/auth');
    expect(j).toContain('checkout main');
    expect(j.find((c) => c.startsWith('branch -d _shiftspace_temp_swap'))).toBeDefined();
    expect(j.some((c) => c.startsWith('stash push'))).toBe(false);
    expect(j.some((c) => c.startsWith('stash pop'))).toBe(false);
  });

  it('calls onProgress with step messages', async () => {
    vi.mocked(execFile).mockImplementation(mockSuccess() as any);
    const progress: string[] = [];
    await swapBranches({ ...DEFAULT_SWAP_OPTS, onProgress: (msg) => progress.push(msg) });
    expect(progress).toContain('Stashing changes...');
    expect(progress).toContain('Swapping branches...');
    expect(progress).toContain('Restoring changes...');
  });
});

// swapBranches — happy path: stash scenarios

describe('swapBranches — stash scenarios', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stashes and cross-pops when worktree A has uncommitted changes', async () => {
    const { calls, joined } = recordingMock((args, allCalls) => {
      if (args[0] === 'status' && allCalls.filter((c) => c[0] === 'status').length === 1)
        return { stdout: ' M src/file.ts\n', stderr: '' };
      if (args[0] === 'stash' && args[1] === 'list')
        return { stdout: 'stash@{0}: On feature/auth: shiftspace-swap-A\n', stderr: '' };
      return undefined;
    });
    await swapBranches(DEFAULT_SWAP_OPTS);
    const j = joined();
    expect(j.some((c) => c.includes('stash push') && c.includes('shiftspace-swap-A'))).toBe(true);
    expect(calls.filter((a) => a[0] === 'stash' && a[1] === 'pop').length).toBe(1);
    expect(j.some((c) => c.includes('shiftspace-swap-B'))).toBe(false);
  });

  it('stashes and cross-pops when worktree B has uncommitted changes', async () => {
    let statusCallCount = 0;
    const { calls, joined } = recordingMock((args) => {
      if (args[0] === 'status') {
        statusCallCount++;
        if (statusCallCount === 2) return { stdout: 'M  src/main.ts\n', stderr: '' };
      }
      if (args[0] === 'stash' && args[1] === 'list')
        return { stdout: 'stash@{0}: On main: shiftspace-swap-B\n', stderr: '' };
      return undefined;
    });
    await swapBranches(DEFAULT_SWAP_OPTS);
    const j = joined();
    expect(j.some((c) => c.includes('stash push') && c.includes('shiftspace-swap-B'))).toBe(true);
    expect(j.some((c) => c.includes('stash push') && c.includes('shiftspace-swap-A'))).toBe(false);
    expect(calls.filter((a) => a[0] === 'stash' && a[1] === 'pop').length).toBe(1);
  });

  it('stashes and cross-pops for both when both have changes', async () => {
    const { calls, joined } = recordingMock((args) => {
      if (args[0] === 'status') return { stdout: ' M file.ts\n', stderr: '' };
      if (args[0] === 'stash' && args[1] === 'list')
        return {
          stdout:
            'stash@{0}: On feature/auth: shiftspace-swap-A\nstash@{1}: On main: shiftspace-swap-B\n',
          stderr: '',
        };
      return undefined;
    });
    await swapBranches(DEFAULT_SWAP_OPTS);
    const j = joined();
    expect(j.some((c) => c.includes('shiftspace-swap-A') && c.includes('stash push'))).toBe(true);
    expect(j.some((c) => c.includes('shiftspace-swap-B') && c.includes('stash push'))).toBe(true);
    expect(calls.filter((a) => a[0] === 'stash' && a[1] === 'pop').length).toBe(2);
  });
});

// swapBranches — failure & rollback

describe('swapBranches — failure and rollback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rolls back and cleans temp branch when checkout on B fails', async () => {
    const { joined } = recordingMock((args) => {
      if (args[0] === 'checkout' && args[1] === 'feature/auth')
        return { error: 'branch already checked out' };
      return undefined;
    });

    await expect(swapBranches(DEFAULT_SWAP_OPTS)).rejects.toThrow('branch already checked out');
    const j = joined();
    const tempDeleted = j.some(
      (c) =>
        (c.startsWith('branch -d') || c.startsWith('branch -D')) &&
        c.includes('_shiftspace_temp_swap')
    );
    expect(tempDeleted).toBe(true);
    expect(j).toContain('checkout feature/auth');
  });

  it('rolls back all steps when checkout on A fails after B switched', async () => {
    let checkoutCount = 0;
    const { joined } = recordingMock((args) => {
      if (args[0] === 'checkout' && args[1] !== '-b') {
        checkoutCount++;
        if (checkoutCount === 2) return { error: 'checkout failed' };
      }
      return undefined;
    });

    await expect(swapBranches(DEFAULT_SWAP_OPTS)).rejects.toThrow('checkout failed');
    const j = joined();
    expect(j.filter((c) => c === 'checkout main').length).toBeGreaterThanOrEqual(1);
    const tempDeleted = j.some(
      (c) =>
        (c.startsWith('branch -d') || c.startsWith('branch -D')) &&
        c.includes('_shiftspace_temp_swap')
    );
    expect(tempDeleted).toBe(true);
  });

  it('preserves stashes in list even if pop fails during rollback', async () => {
    const calls: Array<string[]> = [];
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      rawArgs: string[],
      _opts: unknown,
      cb: Function
    ) => {
      const args = normalizeGitArgs(rawArgs);
      calls.push(args);
      if (args[0] === 'status') {
        cb(null, { stdout: ' M file.ts\n', stderr: '' });
        return;
      }
      if (args[0] === 'checkout' && args[1] === '-b') {
        cb(new Error('cannot create branch'), { stdout: '', stderr: '' });
        return;
      }
      if (args[0] === 'stash' && args[1] === 'list') {
        cb(null, { stdout: 'stash@{0}: On feature/auth: shiftspace-swap-A\n', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await expect(swapBranches(DEFAULT_SWAP_OPTS)).rejects.toThrow('cannot create branch');
    expect(calls.some((a) => a[0] === 'stash' && a[1] === 'pop')).toBe(true);
  });

  it('handles unique temp branch name when _shiftspace_temp_swap already exists', async () => {
    const { joined } = recordingMock((args) => {
      if (args[0] === 'rev-parse' && args[2] === '_shiftspace_temp_swap')
        return { stdout: 'abc1234\n', stderr: '' };
      return undefined;
    });
    await swapBranches(DEFAULT_SWAP_OPTS);
    const j = joined();
    const tempCreate = j.find(
      (c) =>
        c.startsWith('checkout -b _shiftspace_temp_swap_') &&
        c !== 'checkout -b _shiftspace_temp_swap'
    );
    expect(tempCreate).toBeDefined();
  });
});
