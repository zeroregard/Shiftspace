import { gitReadOnly } from './git-utils';

/**
 * Resolve the ref a branch diff should compare against.
 *
 * Diffing against the local base branch is wrong whenever that branch is
 * stale: a local `main` that hasn't been pulled in weeks yields an ancient
 * merge-base, so the "changes on this branch" diff includes everything that
 * landed on the remote since — thousands of files instead of the branch's
 * own ~50. The remote-tracking ref is updated by a plain `git fetch` without
 * ever checking the base branch out, so prefer it:
 *
 *  1. The base branch's configured upstream (e.g. `origin/main`).
 *  2. `origin/<branch>` when no upstream is configured but the
 *     remote-tracking ref exists.
 *  3. The name as given (local-only branch, tag, or commit).
 */
export async function resolveBranchDiffBase(
  worktreePath: string,
  baseBranch: string
): Promise<string> {
  const opts = { cwd: worktreePath, timeout: 5000 };

  try {
    const { stdout } = await gitReadOnly(
      ['rev-parse', '--abbrev-ref', `${baseBranch}@{upstream}`],
      opts
    );
    const upstream = stdout.trim();
    if (upstream) return upstream;
  } catch {
    // No upstream configured — fall through
  }

  try {
    await gitReadOnly(
      ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseBranch}`],
      opts
    );
    return `origin/${baseBranch}`;
  } catch {
    // No remote-tracking ref — fall through
  }

  return baseBranch;
}
