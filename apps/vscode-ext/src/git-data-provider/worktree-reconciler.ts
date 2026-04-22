import type { WorktreeState, ShiftspaceEvent } from '@shiftspace/renderer';
import { log } from '../logger';
import { detectWorktrees, badgesEqual } from '../git/worktrees';
import { reportError, reportUnexpectedState } from '../telemetry';
import { getFilesForMode } from './diff-mode';
import type { GitDataProvider } from './index';

/**
 * Re-detect all worktrees from disk and reconcile them against the host's
 * cached list: emit add/remove/rename/branch-change events, update the file
 * state cache, and reconfigure the per-worktree file watchers surgically
 * (dispose watchers for removed/moved ids, create new ones for added/moved
 * ids) — a full teardown-and-rebuild would churn FSEvents unnecessarily.
 *
 * Preserves user-set diff modes and the per-worktree `lastActivityAt`
 * timestamps. Called from both the HEAD watcher and the 3-second polling
 * fallback.
 */
export async function checkForWorktreeChanges(host: GitDataProvider): Promise<void> {
  if (!host.currentRoot) return;
  try {
    const fresh = await detectWorktrees(host.currentRoot);

    // Guard: if detection returns empty but we already have worktrees, this is
    // almost certainly a transient git error (e.g. lock file during a rename/move).
    // Skip this cycle to avoid flashing "No worktrees".
    if (fresh.length === 0 && host.worktrees.length > 0) {
      log.info('checkForWorktreeChanges: detectWorktrees returned empty, skipping');
      reportUnexpectedState('git.detectWorktrees.transientEmpty', {
        previousCount: String(host.worktrees.length),
      });
      return;
    }

    const prevIds = new Set(host.worktrees.map((wt) => wt.id));
    const freshIds = new Set(fresh.map((wt) => wt.id));

    // Removed worktrees
    for (const wt of host.worktrees) {
      if (!freshIds.has(wt.id)) {
        const event: ShiftspaceEvent = { type: 'worktree-removed', worktreeId: wt.id };
        host.postMessage({ type: 'event', event });
      }
    }

    // Added worktrees
    for (const wt of fresh) {
      if (!prevIds.has(wt.id)) {
        wt.defaultBranch = host.defaultBranch;
        if (wt.branch === host.defaultBranch) {
          wt.diffMode = { type: 'working' };
        } else {
          wt.diffMode = { type: 'branch', branch: host.defaultBranch };
        }
        try {
          const { files, branchFiles } = await getFilesForMode(wt);
          wt.files = files;
          wt.branchFiles = branchFiles;
        } catch (err) {
          log.error('getFileChanges error for new worktree', wt.path, err);
          reportError(err as Error, {
            context: 'getFileChanges.newWorktree',
            branch: wt.branch,
          });
        }
        const event: ShiftspaceEvent = { type: 'worktree-added', worktree: wt };
        host.postMessage({ type: 'event', event });
      }
    }

    // Branch, path, badge, or plan path changed for an existing worktree
    for (const freshWt of fresh) {
      if (!prevIds.has(freshWt.id)) continue; // already handled as new above
      const prevWt = host.worktrees.find((wt) => wt.id === freshWt.id);
      if (!prevWt) continue;

      const branchChanged = prevWt.branch !== freshWt.branch;
      const pathChanged = prevWt.path !== freshWt.path;
      const badgeChanged = !badgesEqual(prevWt.badge, freshWt.badge);
      const planPathChanged = prevWt.planPath !== freshWt.planPath;

      if (!branchChanged && !pathChanged && !badgeChanged && !planPathChanged) continue;

      freshWt.defaultBranch = host.defaultBranch;

      if (branchChanged) {
        // Preserve "repo" (All files) mode across branch changes — the user
        // explicitly chose it and a branch switch shouldn't override that.
        const prevDiffMode = prevWt.diffMode;
        log.info(
          `[diffMode] branch changed: ${prevWt.branch} → ${freshWt.branch}, prev diffMode=${JSON.stringify(prevDiffMode)}`
        );
        freshWt.diffMode =
          prevDiffMode.type === 'repo'
            ? prevDiffMode
            : freshWt.branch === host.defaultBranch
              ? { type: 'working' }
              : { type: 'branch', branch: host.defaultBranch };
        try {
          const { files, branchFiles } = await getFilesForMode(freshWt);
          freshWt.files = files;
          freshWt.branchFiles = branchFiles;
        } catch (err) {
          log.error('getFileChanges error after branch change', freshWt.path, err);
          reportError(err as Error, {
            context: 'getFileChanges.branchChanged',
            branch: freshWt.branch,
          });
          freshWt.files = [];
        }
        host.fileStates.set(freshWt.id, freshWt.files);
        // Checkout counts as activity.
        freshWt.lastActivityAt = Date.now();

        log.info(
          `[diffMode] re-adding worktree after branch change: ${freshWt.branch} diffMode=${JSON.stringify(freshWt.diffMode)}`
        );
      } else if (pathChanged) {
        // Path changed only (rename/move) — preserve diffMode, files, and
        // activity timestamp (renames aren't user-visible "activity").
        freshWt.diffMode = prevWt.diffMode;
        freshWt.files = prevWt.files;
        freshWt.branchFiles = prevWt.branchFiles;
        freshWt.lastActivityAt = prevWt.lastActivityAt;
        host.fileStates.set(freshWt.id, freshWt.files);
        log.info(`[path] worktree path changed: ${prevWt.path} → ${freshWt.path}`);
      } else {
        // Badge- or plan-path-only change — preserve diffMode, files, and
        // activity timestamp. The upsert below propagates the new config to
        // the webview.
        freshWt.diffMode = prevWt.diffMode;
        freshWt.files = prevWt.files;
        freshWt.branchFiles = prevWt.branchFiles;
        freshWt.lastActivityAt = prevWt.lastActivityAt;
        host.fileStates.set(freshWt.id, freshWt.files);
      }

      // Send a worktree-added (upsert) — no remove needed since the ID is the same.
      host.postMessage({ type: 'event', event: { type: 'worktree-added', worktree: freshWt } });
      host.onFileChange?.(freshWt.id);
    }

    preserveExistingDiffModes(host.worktrees, fresh);

    // Reconcile per-worktree file watchers surgically: dispose watchers for
    // removed/moved ids and create new ones for added/moved ids.
    const prevById = new Map(host.worktrees.map((wt) => [wt.id, wt]));
    for (const prevWt of host.worktrees) {
      const freshWt = fresh.find((wt) => wt.id === prevWt.id);
      if (!freshWt || freshWt.path !== prevWt.path) {
        host.fileEvents.removeWorktree(prevWt.id);
      }
    }

    host.worktrees = fresh;

    for (const freshWt of fresh) {
      const prevWt = prevById.get(freshWt.id);
      if (!prevWt || prevWt.path !== freshWt.path) {
        host.fileEvents.addWorktree(freshWt);
      }
    }
  } catch (err) {
    log.error('checkForWorktreeChanges error:', err);
    reportError(err as Error, { context: 'checkForWorktreeChanges' });
  }
}

/**
 * Preserve user-set diffMode for existing worktrees. detectWorktrees() always
 * returns diffMode: { type: 'working' } — without this, any poll would
 * silently reset a "vs main" or "All files" diff mode. Branch-changed
 * worktrees are already handled by the caller with their own logic.
 */
function preserveExistingDiffModes(prev: WorktreeState[], fresh: WorktreeState[]): void {
  for (const freshWt of fresh) {
    const prevWt = prev.find((wt) => wt.id === freshWt.id);
    if (prevWt && prevWt.branch === freshWt.branch) {
      freshWt.diffMode = prevWt.diffMode;
      // Preserve activity timestamp across re-detection polls —
      // detectWorktrees() stamps Date.now() on every call and would
      // otherwise reset the timer on every 3-second poll.
      freshWt.lastActivityAt = prevWt.lastActivityAt;
    } else if (prevWt && prevWt.diffMode.type === 'repo') {
      log.info(
        `[diffMode] preserving repo mode despite branch mismatch: prev=${prevWt.branch} fresh=${freshWt.branch}`
      );
      // Preserve "All files" mode even across branch changes — the user
      // explicitly chose it and shouldn't have to re-select after a
      // transient branch name glitch from concurrent git operations.
      freshWt.diffMode = prevWt.diffMode;
    }
  }
}
