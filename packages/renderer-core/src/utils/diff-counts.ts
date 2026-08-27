import type { DiffStats, WorktreeDiffCountMode, WorktreeState } from '../types';

/** The change counts a worktree card shows, plus what they were measured against. */
export interface WorktreeDiffCounts extends DiffStats {
  /**
   * Base branch the counts are measured against, or undefined when they
   * reflect uncommitted working-tree changes.
   */
  comparedTo?: string;
}

/**
 * Resolve the change counts shown on a worktree card.
 *
 * In `defaultBranch` mode the counts come from the host-computed diff against
 * the repo's default branch — what a PR from this branch would contain. That
 * comparison is meaningless for a worktree already on the default branch, and
 * it isn't available before the host has computed it, so both cases fall back
 * to the working-tree counts.
 */
export function resolveWorktreeDiffCounts(
  wt: WorktreeState,
  mode: WorktreeDiffCountMode
): WorktreeDiffCounts {
  if (mode === 'defaultBranch' && wt.defaultBranchStats) {
    return { ...wt.defaultBranchStats, comparedTo: wt.defaultBranch };
  }
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const f of wt.files) {
    linesAdded += f.linesAdded;
    linesRemoved += f.linesRemoved;
  }
  return { fileCount: wt.files.length, linesAdded, linesRemoved };
}
