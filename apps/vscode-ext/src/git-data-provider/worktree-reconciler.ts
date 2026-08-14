import type { WorktreeState, ShiftspaceEvent } from '@shiftspace/renderer';
import { log } from '../logger';
import { detectWorktrees, badgesEqual } from '../git/worktrees';
import { reportError, reportUnexpectedState } from '../telemetry';
import { getFilesForMode } from './diff-mode';
import type { GitDataProvider } from './index';

/**
 * How many times a single reconcile pass re-detects when the worktree list is
 * mutated (a removal, a rename, a repo switch) while detection is in flight.
 * Three is generous: each retry only loses to a *new* mutation landing during
 * the retry itself.
 */
const MAX_DETECT_ATTEMPTS = 3;

/** Everything a reconcile pass computed, ready to be applied in one shot. */
interface ReconcilePlan {
  /** The new worktree list, already carrying over preserved state. */
  fresh: WorktreeState[];
  /** Events to post, removals first, then adds/upserts. */
  events: ShiftspaceEvent[];
  /** Ids whose files were recomputed — their fileStates entry is refreshed on commit. */
  fileStateIds: string[];
  /** Ids that vanished — their fileStates entry is dropped on commit. */
  removedIds: string[];
  /** Ids to notify `onFileChange` about after committing. */
  notifyIds: string[];
}

/**
 * Re-detect all worktrees from disk and reconcile them against the host's
 * cached list: emit add/remove/rename/branch-change events, update the file
 * state cache, and reconfigure the per-worktree file watchers surgically
 * (dispose watchers for removed/moved ids, create new ones for added/moved
 * ids) — a full teardown-and-rebuild would churn FSEvents unnecessarily.
 *
 * Preserves user-set diff modes, cached file lists, and the per-worktree
 * `lastActivityAt` timestamps. Called from both the HEAD watcher and the
 * 3-second polling fallback.
 *
 * The pass is a compare-and-swap, not a read-then-write: everything is
 * computed off a `git worktree list` snapshot first, and applied only if the
 * host's worktree list hasn't been mutated since the snapshot was taken. A
 * snapshot that raced a deletion would otherwise report the deleted worktree
 * as *newly added* (it's absent from the post-deletion cache), making the
 * card reappear until the next pass removed it again.
 */
export async function checkForWorktreeChanges(host: GitDataProvider): Promise<void> {
  if (!host.currentRoot) return;
  try {
    for (let attempt = 1; attempt <= MAX_DETECT_ATTEMPTS; attempt++) {
      const revision = host.worktreeRevision;
      const plan = await planReconcile(host);
      if (!plan) return;

      if (host.worktreeRevision === revision) {
        commitReconcile(host, plan);
        return;
      }

      log.info(
        `checkForWorktreeChanges: worktree list changed during detection (attempt ${attempt}/${MAX_DETECT_ATTEMPTS}), re-detecting`
      );
    }
    // Something is mutating the list faster than we can read it. Dropping the
    // pass is safe — the 3s poll runs another one — but it shouldn't happen.
    reportUnexpectedState('git.reconcile.staleAfterRetries', {
      attempts: String(MAX_DETECT_ATTEMPTS),
    });
  } catch (err) {
    log.error('checkForWorktreeChanges error:', err);
    reportError(err as Error, { context: 'checkForWorktreeChanges' });
  }
}

/**
 * Read the worktrees from disk and compute everything the commit needs.
 * Touches nothing the host owns — only the freshly detected objects — so a
 * plan built on a stale snapshot can be thrown away without side effects.
 *
 * Returns undefined when there is nothing to apply.
 */
async function planReconcile(host: GitDataProvider): Promise<ReconcilePlan | undefined> {
  const root = host.currentRoot;
  if (!root) return undefined;

  const fresh = await detectWorktrees(root);

  // Guard: if detection returns empty but we already have worktrees, this is
  // almost certainly a transient git error (e.g. lock file during a rename/move).
  // Skip this cycle to avoid flashing "No worktrees".
  if (fresh.length === 0 && host.worktrees.length > 0) {
    log.info('checkForWorktreeChanges: detectWorktrees returned empty, skipping');
    reportUnexpectedState('git.detectWorktrees.transientEmpty', {
      previousCount: String(host.worktrees.length),
    });
    return undefined;
  }

  const prevById = new Map(host.worktrees.map((wt) => [wt.id, wt]));
  const freshIds = new Set(fresh.map((wt) => wt.id));
  const plan: ReconcilePlan = {
    fresh,
    events: [],
    fileStateIds: [],
    removedIds: [],
    notifyIds: [],
  };

  // Removed worktrees first, so the webview drops them before any upsert.
  for (const wt of host.worktrees) {
    if (!freshIds.has(wt.id)) {
      plan.events.push({ type: 'worktree-removed', worktreeId: wt.id });
      plan.removedIds.push(wt.id);
    }
  }

  for (const freshWt of fresh) {
    const prevWt = prevById.get(freshWt.id);
    if (!prevWt) {
      await hydrateNewWorktree(host, freshWt);
      plan.events.push({ type: 'worktree-added', worktree: freshWt });
      continue;
    }
    const changed = await carryOverState(host, prevWt, freshWt);
    if (!changed) continue;
    // Same id, so an upsert is enough — no remove/add pair (which the webview
    // would animate as an exit followed by an enter).
    plan.events.push({ type: 'worktree-added', worktree: freshWt });
    plan.fileStateIds.push(freshWt.id);
    plan.notifyIds.push(freshWt.id);
  }

  return plan;
}

/** Configure a worktree seen for the first time and load its file changes. */
async function hydrateNewWorktree(host: GitDataProvider, wt: WorktreeState): Promise<void> {
  wt.defaultBranch = host.defaultBranch;
  wt.diffMode =
    wt.branch === host.defaultBranch
      ? { type: 'working' }
      : { type: 'branch', branch: host.defaultBranch };
  try {
    const { files, branchFiles } = await getFilesForMode(wt);
    wt.files = files;
    wt.branchFiles = branchFiles;
  } catch (err) {
    log.error('getFileChanges error for new worktree', wt.path, err);
    reportError(err as Error, { context: 'getFileChanges.newWorktree', branch: wt.branch });
  }
}

/**
 * Copy the state `detectWorktrees` can't know about (diff mode, cached files,
 * activity timestamp, PR status) from the cached worktree onto its freshly
 * detected counterpart, refetching files when the branch changed.
 *
 * Returns true when something the webview cares about changed — branch, path,
 * badge, or plan path — meaning the fresh state has to be pushed as an upsert.
 */
async function carryOverState(
  host: GitDataProvider,
  prevWt: WorktreeState,
  freshWt: WorktreeState
): Promise<boolean> {
  // Detection always reports diffMode 'working' and a fresh Date.now(), so
  // every field the user or an earlier poll established is carried over here.
  // "All files" (repo) mode survives even a branch change: the user picked it
  // explicitly and a checkout shouldn't silently override it.
  const branchChanged = prevWt.branch !== freshWt.branch;
  freshWt.defaultBranch = host.defaultBranch;
  freshWt.diffMode =
    !branchChanged || prevWt.diffMode.type === 'repo'
      ? prevWt.diffMode
      : freshWt.branch === host.defaultBranch
        ? { type: 'working' }
        : { type: 'branch', branch: host.defaultBranch };
  freshWt.files = prevWt.files;
  freshWt.branchFiles = prevWt.branchFiles;
  freshWt.lastActivityAt = prevWt.lastActivityAt;
  if (prevWt.prStatus) freshWt.prStatus = prevWt.prStatus;

  const pathChanged = prevWt.path !== freshWt.path;
  const badgeChanged = !badgesEqual(prevWt.badge, freshWt.badge);
  const planPathChanged = prevWt.planPath !== freshWt.planPath;
  if (!branchChanged && !pathChanged && !badgeChanged && !planPathChanged) return false;

  if (branchChanged) {
    log.info(
      `[diffMode] branch changed: ${prevWt.branch} → ${freshWt.branch}, diffMode=${JSON.stringify(freshWt.diffMode)}`
    );
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
    // A checkout counts as activity; a rename or a badge edit does not.
    freshWt.lastActivityAt = Date.now();
  } else if (pathChanged) {
    log.info(`[path] worktree path changed: ${prevWt.path} → ${freshWt.path}`);
  }

  return true;
}

/**
 * Apply a plan to the host in one synchronous burst: no awaits, so nothing can
 * observe (or mutate) a half-applied worktree list.
 */
function commitReconcile(host: GitDataProvider, plan: ReconcilePlan): void {
  const prevById = new Map(host.worktrees.map((wt) => [wt.id, wt]));
  const freshById = new Map(plan.fresh.map((wt) => [wt.id, wt]));

  // Reconcile per-worktree file watchers surgically: dispose watchers for
  // removed/moved ids and create new ones for added/moved ids.
  for (const prevWt of host.worktrees) {
    const freshWt = freshById.get(prevWt.id);
    if (!freshWt || freshWt.path !== prevWt.path) {
      host.fileEvents.removeWorktree(prevWt.id);
    }
  }

  host.worktrees = plan.fresh;

  for (const freshWt of plan.fresh) {
    const prevWt = prevById.get(freshWt.id);
    if (!prevWt || prevWt.path !== freshWt.path) {
      host.fileEvents.addWorktree(freshWt);
    }
  }

  for (const id of plan.removedIds) host.fileStates.delete(id);
  for (const id of plan.fileStateIds) {
    const wt = freshById.get(id);
    if (wt) host.fileStates.set(id, wt.files);
  }

  for (const event of plan.events) {
    host.postMessage({ type: 'event', event });
  }
  for (const id of plan.notifyIds) {
    host.onFileChange?.(id);
  }
}
