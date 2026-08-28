import * as vscode from 'vscode';
import type { WorktreeState } from '@shiftspace/renderer';
import { log } from '../logger';

/** Strip the ref prefixes git output and remote names carry, for name comparison. */
function bareBranchName(branch: string): string {
  return branch
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
    .replace(/^origin\//, '');
}

/** A detached worktree reports a short commit hash where a branch name would be. */
function looksLikeCommitHash(branch: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(branch.trim());
}

/**
 * Whether a worktree may be removed automatically once its pull request lands.
 *
 * Only a feature branch qualifies. The repo's default branch is never dropped
 * — a worktree sitting on `main` outlives any single pull request, and a PR
 * merged *into* it must not take it down with it. Neither is a worktree with
 * no branch of its own (detached HEAD, or `HEAD` when git reported nothing):
 * there is no feature branch there to have finished.
 */
export function isAutoDeletableWorktree(wt: WorktreeState, defaultBranch: string): boolean {
  if (wt.isMainWorktree) return false;
  const branch = bareBranchName(wt.branch ?? '');
  if (!branch || branch === 'HEAD' || looksLikeCommitHash(branch)) return false;
  return branch !== bareBranchName(defaultBranch ?? '');
}

/**
 * Removes a worktree whose pull request just landed, when the user has opted in
 * via `shiftspace.pr.autoDeleteMergedWorktrees` (off by default — deleting a
 * directory behind the user's back is only acceptable if they asked for it).
 *
 * Only a worktree on a feature branch is ever removed: see
 * `isAutoDeletableWorktree`.
 *
 * Each worktree is attempted at most once per session — including after a
 * failure, so a worktree we can't remove (dirty state, permissions) doesn't
 * re-prompt on every poll.
 */
export class MergedWorktreeCleaner {
  /** Worktree ids already auto-deleted (or attempted) after their PR merged. */
  private readonly attempted = new Set<string>();
  /** `id@branch` pairs whose skip has already been logged. */
  private readonly skipLogged = new Set<string>();

  constructor(private readonly remove: (worktreeId: string) => void) {}

  /** Forget past attempts — called when the provider re-initializes. */
  reset(): void {
    this.attempted.clear();
    this.skipLogged.clear();
  }

  /** Called on every poll that reports the worktree's PR as merged. */
  onMerged(wt: WorktreeState, defaultBranch: string): void {
    if (this.attempted.has(wt.id)) return;
    const enabled = vscode.workspace
      .getConfiguration('shiftspace')
      .get<boolean>('pr.autoDeleteMergedWorktrees', false);
    if (!enabled) return;

    if (!isAutoDeletableWorktree(wt, defaultBranch)) {
      // Logged once per worktree/branch pair — the check runs on every poll,
      // and the worktree becomes eligible again if it later moves to a feature
      // branch of its own.
      const key = `${wt.id}@${wt.branch}`;
      if (!this.skipLogged.has(key)) {
        this.skipLogged.add(key);
        log.info(`[pr-status] keeping worktree ${wt.branch} (${wt.path}): not a feature branch`);
      }
      return;
    }

    this.attempted.add(wt.id);
    log.info(`[pr-status] auto-deleting merged worktree ${wt.branch} (${wt.path})`);
    void vscode.window.showInformationMessage(
      `Pull request for "${wt.branch}" was merged — removing its worktree.`
    );
    this.remove(wt.id);
  }
}
