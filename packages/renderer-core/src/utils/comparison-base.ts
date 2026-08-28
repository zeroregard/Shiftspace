import type { WorktreeState } from '../types';

export interface ComparisonBase {
  /** Branch this worktree is measured and diffed against. */
  branch: string;
  /** True when it came from an open pull request rather than the repo default. */
  fromPr: boolean;
}

/**
 * The branch a worktree should be compared against: the base of its open pull
 * request when there is one, otherwise the repo's default branch.
 *
 * This is what makes a stack of PRs readable. Six stacked slices of one
 * 600-line change all sit "600 lines ahead of main", but each one is only 100
 * lines ahead of the slice below it — comparing against the PR's own base
 * shows each worktree as the slice it actually contributes.
 *
 * A merged PR carries no base (its worktree is done), and a PR whose base
 * somehow equals its own branch is ignored rather than producing an empty
 * self-comparison.
 */
export function getComparisonBase(wt: WorktreeState): ComparisonBase {
  const prBase = wt.prStatus?.state === 'merged' ? undefined : wt.prStatus?.baseRef;
  if (prBase && prBase !== wt.branch) return { branch: prBase, fromPr: true };
  return { branch: wt.defaultBranch, fromPr: false };
}
