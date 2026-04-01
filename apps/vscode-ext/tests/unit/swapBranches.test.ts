import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { swapBranches, checkWorktreeSafety } from '../../src/git/worktrees';
import { execFile } from 'child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// checkWorktreeSafety
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// swapBranches — happy path
// ---------------------------------------------------------------------------

describe('swapBranches — happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs the full swap sequence when neither worktree has changes', async () => {
    const calls: Array<string[]> = [];
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      rawArgs: string[],
      _opts: unknown,
      cb: Function
    ) => {
      const args = normalizeGitArgs(rawArgs);
      calls.push(args);
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await swapBranches({
      worktreeAPath: '/wt/feature',
      branchA: 'feature/auth',
      worktreeBPath: '/wt/main',
      branchB: 'main',
    });

    // Verify key steps in order
    const joined = calls.map((a) => a.join(' '));

    // status checks — no changes, so no stash commands
    expect(joined).toContain('status --porcelain');

    // temp branch created on A
    const tempCreate = joined.find((c) => c.startsWith('checkout -b _shiftspace_temp_swap'));
    expect(tempCreate).toBeDefined();

    // branchA checked out on B
    expect(joined).toContain('checkout feature/auth');

    // branchB checked out on A
    expect(joined).toContain('checkout main');

    // temp branch deleted
    const tempDelete = joined.find((c) => c.startsWith('branch -d _shiftspace_temp_swap'));
    expect(tempDelete).toBeDefined();

    // No stash commands (both clean)
    expect(joined.some((c) => c.startsWith('stash push'))).toBe(false);
    expect(joined.some((c) => c.startsWith('stash pop'))).toBe(false);
  });

  it('stashes and cross-pops when worktree A has uncommitted changes', async () => {
    const calls: Array<string[]> = [];
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      rawArgs: string[],
      _opts: unknown,
      cb: Function
    ) => {
      const args = normalizeGitArgs(rawArgs);
      calls.push(args);
      // Return non-empty status for worktree A's first status call
      if (args[0] === 'status' && calls.filter((c) => c[0] === 'status').length === 1) {
        cb(null, { stdout: ' M src/file.ts\n', stderr: '' });
      } else if (args[0] === 'stash' && args[1] === 'list') {
        // Return a stash list containing swap-A
        cb(null, { stdout: 'stash@{0}: On feature/auth: shiftspace-swap-A\n', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    }) as any);

    await swapBranches({
      worktreeAPath: '/wt/feature',
      branchA: 'feature/auth',
      worktreeBPath: '/wt/main',
      branchB: 'main',
    });

    const joined = calls.map((a) => a.join(' '));

    // A's stash should be pushed
    expect(joined.some((c) => c.includes('stash push') && c.includes('shiftspace-swap-A'))).toBe(
      true
    );

    // A's stash should be popped on B (cross-apply)
    const popCalls = calls.filter((a) => a[0] === 'stash' && a[1] === 'pop');
    expect(popCalls.length).toBe(1);

    // B had no changes, so no stash-swap-B push or pop
    expect(joined.some((c) => c.includes('shiftspace-swap-B'))).toBe(false);
  });

  it('stashes and cross-pops when worktree B has uncommitted changes', async () => {
    const calls: Array<string[]> = [];
    let statusCallCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      rawArgs: string[],
      _opts: unknown,
      cb: Function
    ) => {
      const args = normalizeGitArgs(rawArgs);
      calls.push(args);
      if (args[0] === 'status') {
        statusCallCount++;
        // Second status call is for B — return dirty
        if (statusCallCount === 2) {
          cb(null, { stdout: 'M  src/main.ts\n', stderr: '' });
          return;
        }
      }
      if (args[0] === 'stash' && args[1] === 'list') {
        cb(null, { stdout: 'stash@{0}: On main: shiftspace-swap-B\n', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await swapBranches({
      worktreeAPath: '/wt/feature',
      branchA: 'feature/auth',
      worktreeBPath: '/wt/main',
      branchB: 'main',
    });

    const joined = calls.map((a) => a.join(' '));

    // Only B's stash should be pushed
    expect(joined.some((c) => c.includes('stash push') && c.includes('shiftspace-swap-B'))).toBe(
      true
    );
    expect(joined.some((c) => c.includes('stash push') && c.includes('shiftspace-swap-A'))).toBe(
      false
    );

    // B's stash is popped on A (cross-apply)
    const popCalls = calls.filter((a) => a[0] === 'stash' && a[1] === 'pop');
    expect(popCalls.length).toBe(1);
  });

  it('stashes and cross-pops for both when both have changes', async () => {
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
      if (args[0] === 'stash' && args[1] === 'list') {
        cb(null, {
          stdout:
            'stash@{0}: On feature/auth: shiftspace-swap-A\n' +
            'stash@{1}: On main: shiftspace-swap-B\n',
          stderr: '',
        });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await swapBranches({
      worktreeAPath: '/wt/feature',
      branchA: 'feature/auth',
      worktreeBPath: '/wt/main',
      branchB: 'main',
    });

    const joined = calls.map((a) => a.join(' '));

    // Both stashes pushed
    expect(joined.some((c) => c.includes('shiftspace-swap-A') && c.includes('stash push'))).toBe(
      true
    );
    expect(joined.some((c) => c.includes('shiftspace-swap-B') && c.includes('stash push'))).toBe(
      true
    );

    // Both stashes popped (cross-applied)
    const popCalls = calls.filter((a) => a[0] === 'stash' && a[1] === 'pop');
    expect(popCalls.length).toBe(2);
  });

  it('calls onProgress with step messages', async () => {
    vi.mocked(execFile).mockImplementation(mockSuccess() as any);
    const progress: string[] = [];

    await swapBranches({
      worktreeAPath: '/wt/feature',
      branchA: 'feature/auth',
      worktreeBPath: '/wt/main',
      branchB: 'main',
      onProgress: (msg) => progress.push(msg),
    });

    expect(progress).toContain('Stashing changes...');
    expect(progress).toContain('Swapping branches...');
    expect(progress).toContain('Restoring changes...');
  });
});

// ---------------------------------------------------------------------------
// swapBranches — failure & rollback
// ---------------------------------------------------------------------------

describe('swapBranches — failure and rollback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rolls back and cleans temp branch when checkout on B fails', async () => {
    const calls: Array<string[]> = [];
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      rawArgs: string[],
      _opts: unknown,
      cb: Function
    ) => {
      const args = normalizeGitArgs(rawArgs);
      calls.push(args);
      // Fail when checking out feature/auth on B
      if (args[0] === 'checkout' && args[1] === 'feature/auth') {
        cb(new Error('branch already checked out'), { stdout: '', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await expect(
      swapBranches({
        worktreeAPath: '/wt/feature',
        branchA: 'feature/auth',
        worktreeBPath: '/wt/main',
        branchB: 'main',
      })
    ).rejects.toThrow('branch already checked out');

    const joined = calls.map((a) => a.join(' '));

    // Temp branch must be cleaned up
    const tempDeleted = joined.some(
      (c) =>
        (c.startsWith('branch -d') || c.startsWith('branch -D')) &&
        c.includes('_shiftspace_temp_swap')
    );
    expect(tempDeleted).toBe(true);

    // A should be restored to its original branch
    expect(joined).toContain('checkout feature/auth');
  });

  it('rolls back all steps when checkout on A fails after B switched', async () => {
    const calls: Array<string[]> = [];
    let checkoutCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      rawArgs: string[],
      _opts: unknown,
      cb: Function
    ) => {
      const args = normalizeGitArgs(rawArgs);
      calls.push(args);
      if (args[0] === 'checkout' && args[1] !== '-b') {
        checkoutCount++;
        // Third checkout is A → main (after B already got feature/auth)
        if (checkoutCount === 2) {
          cb(new Error('checkout failed'), { stdout: '', stderr: '' });
          return;
        }
      }
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await expect(
      swapBranches({
        worktreeAPath: '/wt/feature',
        branchA: 'feature/auth',
        worktreeBPath: '/wt/main',
        branchB: 'main',
      })
    ).rejects.toThrow('checkout failed');

    const joined = calls.map((a) => a.join(' '));

    // B should be restored to main (to free branchA so A can go back to it)
    const mainRestored = joined.filter((c) => c === 'checkout main');
    expect(mainRestored.length).toBeGreaterThanOrEqual(1);

    // Temp branch must be cleaned up
    const tempDeleted = joined.some(
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
      // Fail during temp branch checkout (early failure)
      if (args[0] === 'checkout' && args[1] === '-b') {
        cb(new Error('cannot create branch'), { stdout: '', stderr: '' });
        return;
      }
      if (args[0] === 'stash' && args[1] === 'list') {
        cb(null, {
          stdout: 'stash@{0}: On feature/auth: shiftspace-swap-A\n',
          stderr: '',
        });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await expect(
      swapBranches({
        worktreeAPath: '/wt/feature',
        branchA: 'feature/auth',
        worktreeBPath: '/wt/main',
        branchB: 'main',
      })
    ).rejects.toThrow('cannot create branch');

    // The stash pop (rollback) should have been attempted on the original worktree
    const popAttempt = calls.some((a) => a[0] === 'stash' && a[1] === 'pop');
    expect(popAttempt).toBe(true);
  });

  it('handles unique temp branch name when _shiftspace_temp_swap already exists', async () => {
    const calls: Array<string[]> = [];
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      rawArgs: string[],
      _opts: unknown,
      cb: Function
    ) => {
      const args = normalizeGitArgs(rawArgs);
      calls.push(args);
      // rev-parse for temp branch name check — simulate it already existing
      if (args[0] === 'rev-parse' && args[2] === '_shiftspace_temp_swap') {
        cb(null, { stdout: 'abc1234\n', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    }) as any);

    await swapBranches({
      worktreeAPath: '/wt/feature',
      branchA: 'feature/auth',
      worktreeBPath: '/wt/main',
      branchB: 'main',
    });

    const joined = calls.map((a) => a.join(' '));
    // A unique temp branch name with suffix should have been created
    const tempCreate = joined.find(
      (c) =>
        c.startsWith('checkout -b _shiftspace_temp_swap_') &&
        c !== 'checkout -b _shiftspace_temp_swap'
    );
    expect(tempCreate).toBeDefined();
  });
});
