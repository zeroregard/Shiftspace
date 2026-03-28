import { execFile } from 'child_process';
import { promisify } from 'util';
import type { WorktreeState } from '@shiftspace/renderer';

const execFileAsync = promisify(execFile);

/**
 * Parse the output of `git worktree list --porcelain` into WorktreeState[].
 * Bare worktrees are skipped.
 */
export function parseWorktreeOutput(output: string): WorktreeState[] {
  const blocks = output
    .trim()
    .split(/\n\n+/)
    .filter((b) => b.trim().length > 0);
  const worktrees: WorktreeState[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n');
    let path = '';
    let branch = '';
    let headCommit = '';
    let isBare = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length).trim();
      } else if (line.startsWith('branch ')) {
        branch = line
          .slice('branch '.length)
          .trim()
          .replace(/^refs\/heads\//, '');
      } else if (line.startsWith('HEAD ')) {
        headCommit = line.slice('HEAD '.length).trim().slice(0, 8);
      } else if (line === 'bare') {
        isBare = true;
      }
    }

    if (isBare || !path) continue;

    // Detached HEAD: use short commit hash as branch name
    const branchName = branch || headCommit || 'HEAD';

    worktrees.push({
      id: `wt-${i}`,
      path,
      branch: branchName,
      files: [],
      diffMode: { type: 'working' },
      defaultBranch: 'main',
      isMainWorktree: i === 0,
    });
  }

  return worktrees;
}

/** Detect all worktrees for the repo rooted at `repoRoot`. */
export async function detectWorktrees(repoRoot: string): Promise<WorktreeState[]> {
  try {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      timeout: 5000,
    });
    return parseWorktreeOutput(stdout);
  } catch {
    return [];
  }
}

/**
 * Resolve the git repo root starting from `dirPath` (must be a directory).
 * Returns null if not inside a git repository.
 */
export async function getGitRoot(dirPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dirPath,
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Detect the repo's default/main branch name.
 *
 * Strategy:
 *  1. Try `git symbolic-ref refs/remotes/origin/HEAD` (set by `git clone`).
 *  2. Check common branch names (main, master, develop).
 *  3. Fall back to 'main'.
 */
export async function getDefaultBranch(gitRoot: string): Promise<string> {
  // Try 1: git symbolic-ref
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: gitRoot,
      timeout: 5000,
    });
    return stdout.trim().replace('refs/remotes/origin/', '');
  } catch {
    // Not set — fall through
  }

  // Try 2: check common names
  for (const candidate of ['main', 'master', 'develop']) {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', candidate], {
        cwd: gitRoot,
        timeout: 5000,
      });
      return candidate;
    } catch {
      continue;
    }
  }

  // Fallback
  return 'main';
}

/**
 * List branches sorted by most recent commit.
 */
export async function listBranches(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['branch', '--format=%(refname:short)', '--sort=-committerdate'],
      { cwd: repoRoot, timeout: 5000 }
    );
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Checkout a branch in the given worktree directory.
 * Throws if the checkout fails (e.g. uncommitted changes, branch doesn't exist).
 */
export async function checkoutBranch(worktreePath: string, branch: string): Promise<void> {
  await execFileAsync('git', ['checkout', branch], { cwd: worktreePath, timeout: 10_000 });
}

/** Fetch all remotes and prune stale tracking branches. */
export async function fetchRemote(repoRoot: string): Promise<void> {
  await execFileAsync('git', ['fetch', '--all', '--prune'], { cwd: repoRoot, timeout: 60_000 });
}

/**
 * Check if a worktree is safe for a branch swap.
 * Returns a human-readable error string if unsafe, or null if safe.
 */
export async function checkWorktreeSafety(worktreePath: string): Promise<string | null> {
  // Detached HEAD check
  try {
    await execFileAsync('git', ['symbolic-ref', '--quiet', 'HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
  } catch {
    return 'Worktree is in detached HEAD state';
  }

  // Merge in progress check
  try {
    await execFileAsync('git', ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    return 'A merge is in progress in this worktree';
  } catch {
    // Not merging — good
  }

  // Rebase in progress check
  try {
    await execFileAsync('git', ['rev-parse', '--quiet', '--verify', 'REBASE_HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    return 'A rebase is in progress in this worktree';
  } catch {
    // Not rebasing — good
  }

  // Merge conflict check (unmerged paths)
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    if (stdout.trim()) {
      const conflicted = stdout.trim().split('\n').slice(0, 3).join(', ');
      return `Worktree has merge conflicts: ${conflicted}`;
    }
  } catch {
    // If this fails, ignore — not a blocking condition
  }

  return null;
}

/** Find a unique temp branch name, avoiding collisions. */
async function findUniqueTempBranchName(worktreePath: string): Promise<string> {
  const base = '_shiftspace_temp_swap';
  try {
    await execFileAsync('git', ['rev-parse', '--quiet', '--verify', base], {
      cwd: worktreePath,
      timeout: 5000,
    });
    // Branch already exists — add timestamp suffix
    return `${base}_${Date.now()}`;
  } catch {
    return base;
  }
}

/** Pop a stash identified by its message from the given worktree's stash list. */
async function popStashByMessage(worktreePath: string, message: string): Promise<void> {
  const { stdout } = await execFileAsync('git', ['stash', 'list'], {
    cwd: worktreePath,
    timeout: 5000,
  });
  for (const line of stdout.trim().split('\n')) {
    if (line.includes(message)) {
      const match = line.match(/^(stash@\{\d+\})/);
      if (match) {
        await execFileAsync('git', ['stash', 'pop', match[1]!], {
          cwd: worktreePath,
          timeout: 30_000,
        });
        return;
      }
    }
  }
  // Stash not found — nothing to pop
}

export interface SwapBranchesOptions {
  /** Path to the linked worktree (the source of the swap). */
  worktreeAPath: string;
  /** Branch currently checked out in worktreeA. */
  branchA: string;
  /** Path to the main worktree (the swap target). */
  worktreeBPath: string;
  /** Branch currently checked out in worktreeB. */
  branchB: string;
  /** Optional progress callback for step-by-step status. */
  onProgress?: (message: string) => void;
}

/**
 * Swap branches between two worktrees.
 *
 * After the swap:
 *  - worktreeA will be on branchB
 *  - worktreeB will be on branchA
 *  - Uncommitted changes are stashed and re-applied to the correct worktree.
 *
 * Uses a temporary branch to avoid the "branch already checked out" constraint.
 * Throws on failure after attempting rollback.
 */
export async function swapBranches(opts: SwapBranchesOptions): Promise<void> {
  const { worktreeAPath, branchA, worktreeBPath, branchB, onProgress } = opts;
  const log = onProgress ?? (() => {});

  let stashedA = false;
  let stashedB = false;
  let tempBranch = '';
  let tempBranchCreated = false;
  let bCheckedOut = false;

  try {
    // ── Step 1: Stash uncommitted changes ──────────────────────────────────
    log('Stashing changes...');

    const { stdout: statusA } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: worktreeAPath,
      timeout: 5000,
    });
    if (statusA.trim()) {
      await execFileAsync('git', ['stash', 'push', '-u', '-m', 'shiftspace-swap-A'], {
        cwd: worktreeAPath,
        timeout: 30_000,
      });
      stashedA = true;
    }

    const { stdout: statusB } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: worktreeBPath,
      timeout: 5000,
    });
    if (statusB.trim()) {
      await execFileAsync('git', ['stash', 'push', '-u', '-m', 'shiftspace-swap-B'], {
        cwd: worktreeBPath,
        timeout: 30_000,
      });
      stashedB = true;
    }

    // ── Step 2: Create temp branch on A (frees branchA) ───────────────────
    log('Swapping branches...');
    tempBranch = await findUniqueTempBranchName(worktreeAPath);
    await execFileAsync('git', ['checkout', '-b', tempBranch], {
      cwd: worktreeAPath,
      timeout: 10_000,
    });
    tempBranchCreated = true;

    // ── Step 3: Check out branchA on B (branchA is now free) ──────────────
    await execFileAsync('git', ['checkout', branchA], {
      cwd: worktreeBPath,
      timeout: 10_000,
    });
    bCheckedOut = true;

    // ── Step 4: Check out branchB on A (branchB is now free) ──────────────
    await execFileAsync('git', ['checkout', branchB], {
      cwd: worktreeAPath,
      timeout: 10_000,
    });

    // ── Step 5: Delete temp branch ────────────────────────────────────────
    await execFileAsync('git', ['branch', '-d', tempBranch], {
      cwd: worktreeAPath,
      timeout: 10_000,
    });
    tempBranchCreated = false;

    // ── Step 6: Restore stashes (cross-applied) ───────────────────────────
    // A's stash → B (B is now on branchA, where A's changes belong)
    // B's stash → A (A is now on branchB, where B's changes belong)
    log('Restoring changes...');
    if (stashedA) {
      try {
        await popStashByMessage(worktreeBPath, 'shiftspace-swap-A');
      } catch (err) {
        console.error('[Shiftspace] swapBranches: failed to pop stash A on B:', err);
        // Non-fatal: stash is preserved in the stash list
      }
    }
    if (stashedB) {
      try {
        await popStashByMessage(worktreeAPath, 'shiftspace-swap-B');
      } catch (err) {
        console.error('[Shiftspace] swapBranches: failed to pop stash B on A:', err);
      }
    }
  } catch (err) {
    // ── Rollback ──────────────────────────────────────────────────────────
    const rollbackIssues: string[] = [];

    if (tempBranchCreated) {
      if (bCheckedOut) {
        // B is on branchA, A is on temp branch.
        // Restore: B → branchB (freeing branchB), A → branchA, delete temp.
        try {
          await execFileAsync('git', ['checkout', branchB], {
            cwd: worktreeBPath,
            timeout: 10_000,
          });
        } catch (e) {
          rollbackIssues.push(`restore B to ${branchB}: ${(e as Error).message}`);
        }
        try {
          await execFileAsync('git', ['checkout', branchA], {
            cwd: worktreeAPath,
            timeout: 10_000,
          });
        } catch (e) {
          rollbackIssues.push(`restore A to ${branchA}: ${(e as Error).message}`);
        }
      } else {
        // B is still on branchB, A is on temp branch. Restore A → branchA.
        try {
          await execFileAsync('git', ['checkout', branchA], {
            cwd: worktreeAPath,
            timeout: 10_000,
          });
        } catch (e) {
          rollbackIssues.push(`restore A to ${branchA}: ${(e as Error).message}`);
        }
      }
      // Always attempt to clean up temp branch
      try {
        await execFileAsync('git', ['branch', '-d', tempBranch], {
          cwd: worktreeAPath,
          timeout: 10_000,
        });
      } catch {
        // Try force-delete
        try {
          await execFileAsync('git', ['branch', '-D', tempBranch], {
            cwd: worktreeAPath,
            timeout: 10_000,
          });
        } catch (e2) {
          rollbackIssues.push(`delete temp branch: ${(e2 as Error).message}`);
        }
      }
    }

    // Pop stashes back to their original worktrees
    if (stashedA) {
      try {
        await popStashByMessage(worktreeAPath, 'shiftspace-swap-A');
      } catch {
        // Stash is preserved in the list — user can recover manually
      }
    }
    if (stashedB) {
      try {
        await popStashByMessage(worktreeBPath, 'shiftspace-swap-B');
      } catch {
        // Stash is preserved in the list
      }
    }

    const rollbackNote =
      rollbackIssues.length > 0 ? ` Rollback issues: ${rollbackIssues.join('; ')}` : '';
    throw new Error(`${(err as Error).message}${rollbackNote}`);
  }
}

/**
 * Check whether the directory is a git repository.
 * Returns 'ok', 'not-repo', or 'no-git' (git binary missing).
 */
export async function checkGitAvailability(dir: string): Promise<'ok' | 'not-repo' | 'no-git'> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], {
      cwd: dir,
      timeout: 5000,
    });
    return 'ok';
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return 'no-git';
    }
    return 'not-repo';
  }
}
