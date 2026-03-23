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
