import * as vscode from 'vscode';
import type { DiffStats, WorktreeDiffCountMode, WorktreeState } from '@shiftspace/renderer';
import { log } from '../logger';
import { getBranchDiffStats, toDiffStats } from '../git/branch-stats';
import { isIgnoredByPatterns } from '../git/ignore-filter';
import { getIgnorePatterns } from './helpers';
import type { GitDataProvider } from './index';

/** Which comparison the worktree cards' change counts should reflect. */
export function getWorktreeDiffCountMode(): WorktreeDiffCountMode {
  const mode = vscode.workspace
    .getConfiguration('shiftspace')
    .get<string>('worktreeDiffCount', 'working');
  return mode === 'defaultBranch' ? 'defaultBranch' : 'working';
}

function statsEqual(a: DiffStats | undefined, b: DiffStats | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.fileCount === b.fileCount &&
    a.linesAdded === b.linesAdded &&
    a.linesRemoved === b.linesRemoved
  );
}

/**
 * Compute a worktree's diff against the repo's default branch.
 *
 * Returns undefined when the comparison says nothing: the counter is set to
 * working changes, or the worktree is already on the default branch (a PR
 * from a branch to itself is empty, so the card falls back to working changes
 * rather than flatly reporting zero).
 */
async function queryStats(wt: WorktreeState): Promise<DiffStats | undefined> {
  if (getWorktreeDiffCountMode() !== 'defaultBranch') return undefined;
  if (wt.branch === wt.defaultBranch) return undefined;
  const patterns = getIgnorePatterns();
  const perFile = await getBranchDiffStats(wt.path, wt.defaultBranch);
  for (const filePath of perFile.keys()) {
    if (isIgnoredByPatterns(filePath, patterns)) perFile.delete(filePath);
  }
  return toDiffStats(perFile);
}

/** Error-swallowing wrapper for callers that have no previous value to keep. */
export async function computeDefaultBranchStats(wt: WorktreeState): Promise<DiffStats | undefined> {
  try {
    return await queryStats(wt);
  } catch (err) {
    log.warn(`[defaultBranchStats] failed for ${wt.branch}: ${String(err)}`);
    return undefined;
  }
}

/**
 * Refresh one worktree's default-branch diff stats and tell the views when
 * they changed. On failure the previous counts stay put — a card showing
 * slightly stale numbers beats one that falls back to working changes because
 * a `git diff` lost a race with a checkout.
 */
export async function refreshDefaultBranchStats(
  host: GitDataProvider,
  wt: WorktreeState
): Promise<void> {
  let stats: DiffStats | undefined;
  try {
    stats = await queryStats(wt);
  } catch (err) {
    log.warn(`[defaultBranchStats] failed for ${wt.branch}: ${String(err)}`);
    return;
  }
  if (statsEqual(wt.defaultBranchStats, stats)) return;
  wt.defaultBranchStats = stats;
  host.postMessage({
    type: 'event',
    event: { type: 'default-branch-stats-updated', worktreeId: wt.id, stats },
  });
}

/** Refresh every tracked worktree's default-branch diff stats. */
export async function refreshAllDefaultBranchStats(host: GitDataProvider): Promise<void> {
  await Promise.allSettled(host.worktrees.map((wt) => refreshDefaultBranchStats(host, wt)));
}
