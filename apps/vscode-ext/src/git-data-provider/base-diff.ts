import * as vscode from 'vscode';
import type { BaseDiff, WorktreeDiffCountMode, WorktreeState } from '@shiftspace/renderer';
import { getComparisonBase } from '@shiftspace/renderer';
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

function baseDiffEqual(a: BaseDiff | undefined, b: BaseDiff | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.base === b.base &&
    a.fileCount === b.fileCount &&
    a.linesAdded === b.linesAdded &&
    a.linesRemoved === b.linesRemoved
  );
}

/**
 * Measure a worktree against the branch it merges into — its commits plus
 * whatever isn't committed yet.
 *
 * The base is the worktree's open PR's base branch when there is one, so a
 * stacked PR is measured against the slice below it rather than against the
 * repo default, and each worktree in the stack reports its own contribution.
 *
 * Returns undefined when that comparison says nothing new: the counter is set
 * to working changes, or the worktree already sits on its base branch, where
 * there are no commits to add and the measure collapses to the working
 * changes the card falls back to.
 */
async function queryBaseDiff(wt: WorktreeState): Promise<BaseDiff | undefined> {
  if (getWorktreeDiffCountMode() !== 'defaultBranch') return undefined;
  const { branch: base } = getComparisonBase(wt);
  if (!base || base === wt.branch) return undefined;
  const patterns = getIgnorePatterns();
  const perFile = await getBranchDiffStats(wt.path, base);
  if (perFile === null) {
    warnUnmeasurable(wt, base);
    return undefined;
  }
  for (const filePath of perFile.keys()) {
    if (isIgnoredByPatterns(filePath, patterns)) perFile.delete(filePath);
  }
  return { base, ...toDiffStats(perFile) };
}

/** Once per worktree+base per session — this fires on every refresh otherwise. */
const warnedUnmeasurable = new Set<string>();

function warnUnmeasurable(wt: WorktreeState, base: string): void {
  const key = `${wt.path} vs ${base}`;
  if (warnedUnmeasurable.has(key)) return;
  warnedUnmeasurable.add(key);
  log.warn(
    `[baseDiff] ${wt.branch} shares no reachable history with ${base} — ` +
      `the card falls back to working changes. A shallow clone usually causes ` +
      `this; \`git fetch --unshallow\` repairs it.`
  );
}

/** Error-swallowing wrapper for callers that have no previous value to keep. */
export async function computeBaseDiff(wt: WorktreeState): Promise<BaseDiff | undefined> {
  try {
    return await queryBaseDiff(wt);
  } catch (err) {
    log.warn(`[baseDiff] failed for ${wt.branch}: ${String(err)}`);
    return undefined;
  }
}

/**
 * Refresh one worktree's base diff and tell the views when it changed. On
 * failure the previous counts stay put — a card showing slightly stale
 * numbers beats one that falls back to working changes because a `git diff`
 * lost a race with a checkout.
 */
export async function refreshBaseDiff(host: GitDataProvider, wt: WorktreeState): Promise<void> {
  let diff: BaseDiff | undefined;
  try {
    diff = await queryBaseDiff(wt);
  } catch (err) {
    log.warn(`[baseDiff] failed for ${wt.branch}: ${String(err)}`);
    return;
  }
  if (baseDiffEqual(wt.baseDiff, diff)) return;
  wt.baseDiff = diff;
  host.postMessage({
    type: 'event',
    event: { type: 'base-diff-updated', worktreeId: wt.id, diff },
  });
}

/** Refresh every tracked worktree's base diff. */
export async function refreshAllBaseDiffs(host: GitDataProvider): Promise<void> {
  await Promise.allSettled(host.worktrees.map((wt) => refreshBaseDiff(host, wt)));
}
