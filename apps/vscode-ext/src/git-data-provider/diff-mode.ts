import type { WorktreeState, DiffMode, FileChange } from '@shiftspace/renderer';
import { log } from '../logger';
import { getFileChanges, getBranchDiffFileChanges, getRepoFiles } from '../git/status';
import { filterIgnoredFiles } from '../git/ignore-filter';
import { reportError } from '../telemetry';
import { getIgnorePatterns, isDiffModeEqual } from './helpers';
import type { GitDataProvider } from './index';

/**
 * Fetch the working-tree files (staged/unstaged) and, in branch mode, the
 * committed branch-diff files separately.
 *
 * - `files`       → always the current git status (staged + unstaged working changes)
 * - `branchFiles` → only in branch mode: commits on this branch vs the base
 *
 * Pass `mode` explicitly to fetch for a prospective mode without mutating
 * `wt.diffMode` first — callers that need atomic fetch-then-commit (e.g.
 * applyDiffModeOverrides, handleSetDiffMode) rely on this so the shared
 * worktree state is never left with a new diffMode and stale branchFiles.
 */
export async function getFilesForMode(
  wt: WorktreeState,
  mode: DiffMode = wt.diffMode
): Promise<{ files: FileChange[]; branchFiles?: FileChange[] }> {
  const patterns = getIgnorePatterns();
  if (mode.type === 'repo') {
    const branchFiles = await getRepoFiles(wt.path).then((f) => filterIgnoredFiles(f, patterns));
    return { files: [], branchFiles };
  }
  if (mode.type === 'branch') {
    // Run sequentially to avoid concurrent git processes on the same repo
    const files = await getFileChanges(wt.path).then((f) => filterIgnoredFiles(f, patterns));
    const branchFiles = await getBranchDiffFileChanges(wt.path, mode.branch).then((f) =>
      filterIgnoredFiles(f, patterns)
    );
    return { files, branchFiles };
  }
  const files = await getFileChanges(wt.path).then((f) => filterIgnoredFiles(f, patterns));
  return { files };
}

/**
 * Apply persisted diff mode overrides (keyed by branch name) to the
 * current worktrees. Fetches file data for the target mode BEFORE
 * mutating the shared worktree state so `wt.diffMode` and
 * `wt.branchFiles` are always consistent — a late-registering view
 * (sidebar or a reopened panel) will never see an override-branch
 * diffMode paired with undefined branchFiles, which would render the
 * inspection view empty despite the selector showing "vs staging".
 */
export async function applyDiffModeOverrides(
  host: GitDataProvider,
  overrides: Record<string, DiffMode>
): Promise<void> {
  if (!overrides || Object.keys(overrides).length === 0) return;
  await Promise.all(
    host.worktrees.map(async (wt) => {
      const override = overrides[wt.branch];
      if (!override) return;
      // Skip if already matching (e.g. feature branch already defaults to "vs main")
      if (isDiffModeEqual(wt.diffMode, override)) return;
      log.info(`[diffMode] applyOverride: ${wt.branch} → ${JSON.stringify(override)}`);
      try {
        // Fetch with the target mode explicitly — do NOT mutate wt.diffMode
        // yet, so concurrent readers still see a consistent snapshot.
        const { files, branchFiles } = await getFilesForMode(wt, override);
        // If diffMode was changed mid-flight by another caller (e.g.
        // handleSetDiffMode from the webview), drop our stale result.
        const currentExpected = overrides[wt.branch];
        if (!currentExpected || !isDiffModeEqual(currentExpected, override)) {
          log.info(
            `[diffMode] applyOverride dropped (override changed): ${wt.branch} target=${JSON.stringify(override)}`
          );
          return;
        }
        // Atomic commit: diffMode + files + branchFiles together.
        wt.diffMode = override;
        wt.files = files;
        wt.branchFiles = branchFiles;
        host.fileStates.set(wt.id, files);
        host.postMessage({
          type: 'worktree-files-updated',
          worktreeId: wt.id,
          files,
          diffMode: override,
          branchFiles,
        });
      } catch (err) {
        log.error('applyDiffModeOverrides error for', wt.path, err);
        reportError(err as Error, {
          context: 'applyDiffModeOverrides',
          branch: wt.branch,
          mode: override.type,
        });
      }
    })
  );
}
