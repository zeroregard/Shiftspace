import type { DiffStats } from '@shiftspace/renderer';
import { gitReadOnly } from './git-utils';
import { resolveBranchDiffBase } from './branch-base';
import { parseNumstatOutput } from './status';

/**
 * Summarize the branch diff against `baseBranch` without fetching hunks.
 *
 * Same three-dot comparison as `getBranchDiffFileChanges` (so the numbers
 * match what a PR against that branch would show), but only `--numstat` is
 * run: the worktree card needs totals, not per-file diffs, and this runs on
 * every commit across every worktree.
 */
export async function getBranchDiffStats(
  worktreePath: string,
  baseBranch: string
): Promise<Map<string, { added: number; removed: number }>> {
  const base = await resolveBranchDiffBase(worktreePath, baseBranch);
  const { stdout } = await gitReadOnly(['diff', '--numstat', `${base}...HEAD`], {
    cwd: worktreePath,
    timeout: 10_000,
  });
  return parseNumstatOutput(stdout);
}

/** Fold per-file numstat entries into the totals shown on a worktree card. */
export function toDiffStats(perFile: Map<string, { added: number; removed: number }>): DiffStats {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const { added, removed } of perFile.values()) {
    linesAdded += added;
    linesRemoved += removed;
  }
  return { fileCount: perFile.size, linesAdded, linesRemoved };
}
