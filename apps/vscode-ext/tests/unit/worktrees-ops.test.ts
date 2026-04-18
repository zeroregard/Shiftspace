import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import {
  detectWorktrees,
  checkoutBranch,
  fetchRemote,
  removeWorktree,
  pruneWorktrees,
  moveWorktree,
  recoverStuckTempBranch,
  checkGitAvailability,
} from '../../src/git/worktrees';
import { gitQueue } from '../../src/git/git-utils';
import { execFile } from 'child_process';

type ExecCallback = (
  err: (NodeJS.ErrnoException & { stderr?: string }) | null,
  result: { stdout: string; stderr: string }
) => void;

type ExecImpl = (cmd: string, args: string[], opts: unknown, cb: ExecCallback) => void;

function setExec(impl: ExecImpl): void {
  vi.mocked(execFile).mockImplementation(impl as never);
}

/** Strip the `--no-optional-locks` flag that read-only commands prepend. */
function normalize(args: string[]): string[] {
  return args[0] === '--no-optional-locks' ? args.slice(1) : args;
}

async function drainQueue(): Promise<void> {
  while (gitQueue.isActive()) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * Record every git invocation. Handler can return either a success payload, an
 * error payload, or undefined (= default success with empty stdout).
 */
function recorder(
  handler?: (
    args: string[],
    calls: Array<string[]>
  ) => { stdout?: string; stderr?: string } | { error: string; code?: string } | undefined
) {
  const calls: Array<string[]> = [];
  setExec((_cmd, rawArgs, _opts, cb) => {
    const args = normalize(rawArgs);
    calls.push(args);
    const resp = handler?.(args, calls);
    if (resp && 'error' in resp) {
      const err = Object.assign(new Error(resp.error), {
        stderr: resp.error,
        code: resp.code,
      }) as NodeJS.ErrnoException & { stderr?: string };
      cb(err, { stdout: '', stderr: resp.error });
      return;
    }
    cb(null, { stdout: resp?.stdout ?? '', stderr: resp?.stderr ?? '' });
  });
  return {
    calls,
    joined: () => calls.map((a) => a.join(' ')),
  };
}

// ---------------------------------------------------------------------------
// detectWorktrees
// ---------------------------------------------------------------------------

describe('detectWorktrees', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('parses `git worktree list --porcelain` and reads per-worktree badges', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'shiftspace-wt-detect-'));
    try {
      const output = [`worktree ${tmp}`, 'HEAD abc12345def6789', 'branch refs/heads/main', ''].join(
        '\n'
      );
      setExec((_cmd, args, _opts, cb) => {
        expect(normalize(args)).toEqual(['worktree', 'list', '--porcelain']);
        cb(null, { stdout: output, stderr: '' });
      });
      const worktrees = await detectWorktrees(tmp);
      expect(worktrees).toHaveLength(1);
      expect(worktrees[0]).toMatchObject({ path: tmp, branch: 'main', isMainWorktree: true });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns an empty array when git fails (never throws to caller)', async () => {
    const err = Object.assign(new Error('fatal'), { stderr: 'fatal: not a git repository' });
    setExec((_cmd, _args, _opts, cb) => cb(err as never, { stdout: '', stderr: '' }));
    const worktrees = await detectWorktrees('/not/a/repo');
    expect(worktrees).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Thin gitWrite wrappers
// ---------------------------------------------------------------------------

describe('checkoutBranch', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('invokes `git checkout <branch>` in the worktree cwd', async () => {
    let seenCwd = '';
    const rec = recorder();
    setExec((_cmd, rawArgs, opts, cb) => {
      seenCwd = (opts as { cwd?: string }).cwd ?? '';
      rec.calls.push(normalize(rawArgs));
      cb(null, { stdout: '', stderr: '' });
    });
    await checkoutBranch('/wt/feature', 'feature/auth');
    expect(rec.calls[0]).toEqual(['checkout', 'feature/auth']);
    expect(seenCwd).toBe('/wt/feature');
  });

  it('propagates git errors', async () => {
    setExec((_cmd, _args, _opts, cb) =>
      cb(Object.assign(new Error('fatal'), { stderr: 'error: pathspec x' }) as never, {
        stdout: '',
        stderr: '',
      })
    );
    await expect(checkoutBranch('/wt', 'nope')).rejects.toThrow(/pathspec/);
  });
});

describe('fetchRemote', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('runs `git fetch --all --prune` against the repo root', async () => {
    const rec = recorder();
    await fetchRemote('/repo');
    expect(rec.joined()).toContain('fetch --all --prune');
  });
});

describe('removeWorktree', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('runs `git worktree remove <path>` from the git root (no --force by default)', async () => {
    let seenCwd = '';
    const rec = recorder();
    setExec((_cmd, rawArgs, opts, cb) => {
      seenCwd = (opts as { cwd?: string }).cwd ?? '';
      rec.calls.push(normalize(rawArgs));
      cb(null, { stdout: '', stderr: '' });
    });
    await removeWorktree('/wt/feature', '/repo');
    expect(rec.calls[0]).toEqual(['worktree', 'remove', '/wt/feature']);
    expect(seenCwd).toBe('/repo');
  });

  it('appends --force when requested', async () => {
    const rec = recorder();
    await removeWorktree('/wt/feature', '/repo', true);
    expect(rec.calls[0]).toEqual(['worktree', 'remove', '/wt/feature', '--force']);
  });
});

describe('pruneWorktrees', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('runs `git worktree prune` on the git root', async () => {
    const rec = recorder();
    await pruneWorktrees('/repo');
    expect(rec.joined()).toContain('worktree prune');
  });
});

describe('moveWorktree', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('runs `git worktree move <old> <new>` from the git root', async () => {
    let seenCwd = '';
    const rec = recorder();
    setExec((_cmd, rawArgs, opts, cb) => {
      seenCwd = (opts as { cwd?: string }).cwd ?? '';
      rec.calls.push(normalize(rawArgs));
      cb(null, { stdout: '', stderr: '' });
    });
    await moveWorktree('/old/path', '/new/path', '/repo');
    expect(rec.calls[0]).toEqual(['worktree', 'move', '/old/path', '/new/path']);
    expect(seenCwd).toBe('/repo');
  });
});

// ---------------------------------------------------------------------------
// recoverStuckTempBranch
// ---------------------------------------------------------------------------

describe('recoverStuckTempBranch', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('returns false and does nothing when the worktree is on a normal branch', async () => {
    const rec = recorder((args) => {
      if (args[0] === 'symbolic-ref') return { stdout: 'feature/auth\n' };
      return undefined;
    });
    const result = await recoverStuckTempBranch('/wt');
    expect(result).toBe(false);
    // Only the symbolic-ref probe should have run — no checkout or branch -D
    expect(rec.joined().some((c) => c.startsWith('checkout'))).toBe(false);
    expect(rec.joined().some((c) => c.startsWith('branch -D'))).toBe(false);
  });

  it('returns false when the current branch cannot be resolved (detached HEAD)', async () => {
    const rec = recorder((args) => {
      if (args[0] === 'symbolic-ref') return { error: 'fatal: not a symbolic ref' };
      return undefined;
    });
    const result = await recoverStuckTempBranch('/wt');
    expect(result).toBe(false);
    expect(rec.joined().some((c) => c.startsWith('checkout'))).toBe(false);
  });

  it('checks out the previous branch and force-deletes the temp branch on recovery', async () => {
    const rec = recorder((args) => {
      if (args[0] === 'symbolic-ref') return { stdout: '_shiftspace_temp_swap\n' };
      return undefined;
    });
    const result = await recoverStuckTempBranch('/wt');
    expect(result).toBe(true);
    const joined = rec.joined();
    expect(joined).toContain('checkout -');
    expect(joined).toContain('branch -D _shiftspace_temp_swap');
  });

  it('still attempts to delete the temp branch even if `checkout -` fails', async () => {
    const rec = recorder((args) => {
      if (args[0] === 'symbolic-ref') return { stdout: '_shiftspace_temp_swap_123\n' };
      if (args[0] === 'checkout' && args[1] === '-') return { error: 'checkout failed' };
      return undefined;
    });
    const result = await recoverStuckTempBranch('/wt');
    expect(result).toBe(true);
    expect(rec.joined()).toContain('branch -D _shiftspace_temp_swap_123');
  });

  it('recognizes the suffixed temp-branch variant (`_shiftspace_temp_swap_<ts>`)', async () => {
    const rec = recorder((args) => {
      if (args[0] === 'symbolic-ref') return { stdout: '_shiftspace_temp_swap_1700000000000\n' };
      return undefined;
    });
    const result = await recoverStuckTempBranch('/wt');
    expect(result).toBe(true);
    expect(rec.joined()).toContain('branch -D _shiftspace_temp_swap_1700000000000');
  });
});

// ---------------------------------------------------------------------------
// checkGitAvailability
// ---------------------------------------------------------------------------

describe('checkGitAvailability', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('returns "ok" when `git rev-parse --git-dir` succeeds', async () => {
    setExec((_cmd, _args, _opts, cb) => cb(null, { stdout: '.git\n', stderr: '' }));
    expect(await checkGitAvailability('/repo')).toBe('ok');
  });

  it('returns "not-repo" when git runs but the directory is not a repo', async () => {
    const err = Object.assign(new Error('fatal'), {
      stderr: 'fatal: not a git repository',
    }) as NodeJS.ErrnoException & { stderr?: string };
    setExec((_cmd, _args, _opts, cb) => cb(err, { stdout: '', stderr: err.stderr ?? '' }));
    expect(await checkGitAvailability('/not-a-repo')).toBe('not-repo');
  });

  it('returns "no-git" when the git binary is missing (ENOENT)', async () => {
    const err = Object.assign(new Error('spawn git ENOENT'), {
      code: 'ENOENT',
    }) as NodeJS.ErrnoException;
    setExec((_cmd, _args, _opts, cb) => cb(err, { stdout: '', stderr: '' }));
    expect(await checkGitAvailability('/anywhere')).toBe('no-git');
  });
});
