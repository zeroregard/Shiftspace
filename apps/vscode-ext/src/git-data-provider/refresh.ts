import type { WorktreeState } from '@shiftspace/renderer';
import { log } from '../logger';
import { diffFileChanges } from '../git/event-diff';
import { reportError } from '../telemetry';
import { preserveLastChangedAt } from './helpers';
import { getFilesForMode } from './diff-mode';
import type { GitDataProvider } from './index';

/** Initial file-change load for every tracked worktree. */
export async function loadAllFileChanges(host: GitDataProvider): Promise<void> {
  await Promise.allSettled(
    host.worktrees.map(async (wt) => {
      try {
        const { files, branchFiles } = await getFilesForMode(wt);
        wt.files = files;
        wt.branchFiles = branchFiles;
        host.fileStates.set(wt.id, files);
      } catch (err) {
        log.error('loadAllFileChanges error for', wt.path, err);
        reportError(err as Error, { context: 'loadAllFileChanges', branch: wt.branch });
      }
    })
  );
}

/**
 * Re-read every worktree's files through the current ignore filter and emit
 * diff events for any newly included/excluded paths.
 */
export async function reloadAllWithFilter(host: GitDataProvider): Promise<void> {
  for (const wt of host.worktrees) {
    try {
      const { files: rawNewFiles, branchFiles: rawBranchFiles } = await getFilesForMode(wt);
      const prevFiles = host.fileStates.get(wt.id) ?? [];
      const newFiles = preserveLastChangedAt(prevFiles, rawNewFiles);
      const branchFiles = rawBranchFiles
        ? preserveLastChangedAt(wt.branchFiles ?? [], rawBranchFiles)
        : rawBranchFiles;
      const events = diffFileChanges(wt.id, prevFiles, newFiles);
      wt.files = newFiles;
      wt.branchFiles = branchFiles;
      host.fileStates.set(wt.id, newFiles);
      for (const event of events) {
        host.postMessage({ type: 'event', event });
      }
    } catch (err) {
      log.error('reloadAllWithFilter error for', wt.path, err);
      reportError(err as Error, { context: 'reloadAllWithFilter', branch: wt.branch });
    }
  }
}

/**
 * Re-query a single worktree's git state and emit file events for anything
 * that changed. Also updates the worktree's `lastActivityAt` timestamp when
 * the change reflects a non-gitignored content edit or revert.
 */
export async function refreshWorktree(host: GitDataProvider, wt: WorktreeState): Promise<void> {
  try {
    const { files: rawNewFiles, branchFiles: rawBranchFiles } = await getFilesForMode(wt);
    const prevFiles = host.fileStates.get(wt.id) ?? [];

    // git/status.ts stamps every file with `lastChangedAt: Date.now()` because
    // it has no prev-state context. Preserve the previous timestamp for files
    // whose tracked fields didn't change, so `lastChangedAt` reflects when the
    // file actually changed rather than when git was last polled.
    const newFiles = preserveLastChangedAt(prevFiles, rawNewFiles);
    const prevBranch = wt.branchFiles ?? [];
    const branchFiles = rawBranchFiles
      ? preserveLastChangedAt(prevBranch, rawBranchFiles)
      : rawBranchFiles;

    const events = diffFileChanges(wt.id, prevFiles, newFiles);

    // Detect branchFiles changes (e.g. after a commit)
    const newBranch = branchFiles ?? [];
    const branchChanged = diffFileChanges(wt.id, prevBranch, newBranch).length > 0;

    wt.files = newFiles;
    wt.branchFiles = branchFiles;
    host.fileStates.set(wt.id, newFiles);

    for (const event of events) {
      host.postMessage({ type: 'event', event });
    }

    // Activity = non-gitignored working-tree content change or revert.
    // - Commits: branchChanged with no working-file content events → NOT activity.
    // - Reverts: a file-removed event with no branch advance → activity.
    // - Content edits: a file-changed event whose content actually changed
    //   → activity (the reducer handles the per-file bump; we just need to
    //   keep the provider's wt.lastActivityAt in sync).
    const prevByPath = new Map(prevFiles.map((f) => [f.path, f]));
    const hasContentChange = newFiles.some((f) => {
      const p = prevByPath.get(f.path);
      return (
        !p ||
        p.status !== f.status ||
        p.linesAdded !== f.linesAdded ||
        p.linesRemoved !== f.linesRemoved
      );
    });
    const hasRevert = !branchChanged && events.some((e) => e.type === 'file-removed');

    if (hasContentChange) {
      let maxTs = wt.lastActivityAt;
      for (const f of newFiles) if (f.lastChangedAt > maxTs) maxTs = f.lastChangedAt;
      wt.lastActivityAt = maxTs;
    }
    if (hasRevert) {
      const now = Date.now();
      if (now > wt.lastActivityAt) wt.lastActivityAt = now;
      host.postMessage({
        type: 'event',
        event: { type: 'worktree-activity', worktreeId: wt.id, timestamp: now },
      });
    }

    // Notify stale callback if working files or branch diff changed
    if (events.length > 0 || branchChanged) {
      host.onFileChange?.(wt.id);
    }
  } catch (err) {
    log.error('refreshWorktree error for', wt.path, err);
    reportError(err as Error, { context: 'refreshWorktree', branch: wt.branch });
  }
}
