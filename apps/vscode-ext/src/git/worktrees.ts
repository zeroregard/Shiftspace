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
