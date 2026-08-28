import type { DiffStats, WorktreeDiffCountMode, WorktreeState } from '../types';

/** The change counts a worktree card shows, plus what they were measured against. */
export interface WorktreeDiffCounts extends DiffStats {
  /**
   * Branch the counts are measured against — an open PR's base branch when
   * there is one, else the repo default. Undefined when the counts reflect
   * uncommitted working-tree changes.
   */
  comparedTo?: string;
}

/**
 * Resolve the change counts shown on a worktree card.
 *
 * In `defaultBranch` mode the counts come from the host-computed diff against
 * the branch this one merges into — its commits plus its uncommitted work,
 * i.e. what a PR would contain once the current changes are committed. The
 * host reports which branch it measured against, so a worktree in a stack
 * shows its own slice rather than the whole stack.
 *
 * That comparison adds nothing for a worktree already sitting on its base
 * branch, and it isn't available before the host has computed it, so both
 * cases fall back to the working-tree counts.
 */
export function resolveWorktreeDiffCounts(
  wt: WorktreeState,
  mode: WorktreeDiffCountMode
): WorktreeDiffCounts {
  if (mode === 'defaultBranch' && wt.baseDiff) {
    const { base, ...stats } = wt.baseDiff;
    return { ...stats, comparedTo: base };
  }
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const f of wt.files) {
    linesAdded += f.linesAdded;
    linesRemoved += f.linesRemoved;
  }
  return { fileCount: wt.files.length, linesAdded, linesRemoved };
}
