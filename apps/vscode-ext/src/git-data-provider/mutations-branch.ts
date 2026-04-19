import * as vscode from 'vscode';
import type { DiffMode } from '@shiftspace/renderer';
import { log } from '../logger';
import {
  listBranches,
  checkoutBranch,
  fetchRemote,
  checkWorktreeSafety,
  swapBranches,
} from '../git/worktrees';
import { reportError } from '../telemetry';
import { getFilesForMode } from './diff-mode';
import type { GitDataProvider } from './index';

/** Handle a diff mode change from the webview. */
export async function handleSetDiffMode(
  host: GitDataProvider,
  worktreeId: string,
  diffMode: DiffMode
): Promise<void> {
  const wt = host.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return;

  log.info(`[diffMode] handleSetDiffMode: ${wt.branch} → ${JSON.stringify(diffMode)}`);
  wt.diffMode = diffMode;

  try {
    const { files, branchFiles } = await getFilesForMode(wt);
    wt.files = files;
    wt.branchFiles = branchFiles;
    host.fileStates.set(worktreeId, files);
    host.postMessage({
      type: 'worktree-files-updated',
      worktreeId,
      files,
      diffMode,
      branchFiles,
    });
    // Notify so insights re-run against the new file set
    host.onFileChange?.(worktreeId);
  } catch (err) {
    log.error('handleSetDiffMode error:', err);
    reportError(err as Error, {
      context: 'handleSetDiffMode',
      branch: wt.branch,
      mode: diffMode.type,
    });
    // Send back empty to clear loading state
    host.postMessage({ type: 'worktree-files-updated', worktreeId, files: [], diffMode });
  }
}

/** Run git fetch --all --prune and refresh the branch list. */
export async function handleFetchBranches(
  host: GitDataProvider,
  worktreeId: string
): Promise<void> {
  if (!host.currentRoot) return;
  host.postMessage({ type: 'fetch-loading', worktreeId, loading: true });
  try {
    await fetchRemote(host.currentRoot);
    const branches = await listBranches(host.currentRoot);
    host.postMessage({ type: 'fetch-done', worktreeId, timestamp: Date.now(), branches });
  } catch (err) {
    log.error('handleFetchBranches error:', err);
    reportError(err as Error, { context: 'handleFetchBranches' });
    host.postMessage({ type: 'fetch-loading', worktreeId, loading: false });
  }
}

/** Handle a branch list request from the webview. */
export async function handleGetBranchList(
  host: GitDataProvider,
  worktreeId: string
): Promise<void> {
  if (!host.currentRoot) return;
  try {
    const branches = await listBranches(host.currentRoot);
    host.postMessage({ type: 'branch-list', worktreeId, branches });
  } catch (err) {
    log.error('handleGetBranchList error:', err);
    reportError(err as Error, { context: 'handleGetBranchList' });
  }
}

/** Checkout a different branch in the given worktree, then re-initialise. */
export async function handleCheckoutBranch(
  host: GitDataProvider,
  worktreeId: string,
  branch: string
): Promise<void> {
  const wt = host.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return;
  try {
    await checkoutBranch(wt.path, branch);
    // Re-detect so the branch name and files reflect the new HEAD.
    await host.reinitialize();
  } catch (err) {
    log.error('handleCheckoutBranch error:', err);
    reportError(err as Error, {
      context: 'handleCheckoutBranch',
      fromBranch: wt.branch,
      toBranch: branch,
    });
    void vscode.window.showErrorMessage(
      `Failed to checkout "${branch}": ${(err as Error).message}`
    );
  }
}

/** Swap branches between the given linked worktree and the primary worktree. */
export async function handleSwapBranches(host: GitDataProvider, worktreeId: string): Promise<void> {
  const linkedWt = host.worktrees.find((w) => w.id === worktreeId);
  if (!linkedWt) return;

  const mainWt = host.worktrees.find((w) => w.isMainWorktree && w.id !== worktreeId);
  if (!mainWt) {
    void vscode.window.showErrorMessage(`Cannot swap: primary worktree not found.`);
    return;
  }

  const safetyLinked = await checkWorktreeSafety(linkedWt.path);
  if (safetyLinked) {
    void vscode.window.showErrorMessage(`Cannot swap: ${safetyLinked}`);
    return;
  }

  const safetyMain = await checkWorktreeSafety(mainWt.path);
  if (safetyMain) {
    void vscode.window.showErrorMessage(`Cannot swap: primary worktree — ${safetyMain}`);
    return;
  }

  // Only prompt when there are unstaged changes that will be stashed/restored.
  // A clean swap (or one with only staged/committed changes) is safe enough to
  // execute without interrupting the user.
  const hasUnstagedChanges = (wt: typeof linkedWt) =>
    wt.files.some((f) => !f.staged || f.partiallyStaged);
  if (hasUnstagedChanges(linkedWt) || hasUnstagedChanges(mainWt)) {
    const answer = await vscode.window.showInformationMessage(
      `Swap branches? This worktree (${linkedWt.branch}) will get ${mainWt.branch}'s branch, and primary worktree will get ${linkedWt.branch}. Uncommitted changes will be stashed and restored.`,
      { modal: true },
      'Yes'
    );
    if (answer !== 'Yes') return;
  }

  // Signal loading state to both worktrees before starting
  host.postMessage({ type: 'swap-loading', worktreeId: linkedWt.id, loading: true });
  host.postMessage({ type: 'swap-loading', worktreeId: mainWt.id, loading: true });

  // Execute swap with progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Shiftspace: Swapping branches',
      cancellable: false,
    },
    async (progress) => {
      try {
        await swapBranches({
          worktreeAPath: linkedWt.path,
          branchA: linkedWt.branch,
          worktreeBPath: mainWt.path,
          branchB: mainWt.branch,
          onProgress: (msg) => progress.report({ message: msg }),
        });
        progress.report({ message: 'Done! Refreshing...' });
        await host.reinitialize();
      } catch (err) {
        log.error('handleSwapBranches error:', err);
        reportError(err as Error, {
          context: 'handleSwapBranches',
          branchA: linkedWt.branch,
          branchB: mainWt.branch,
        });
        void vscode.window.showErrorMessage(
          `Branch swap failed: ${(err as Error).message}. Check git stash list for any stashed changes.`
        );
      } finally {
        host.postMessage({ type: 'swap-loading', worktreeId: linkedWt.id, loading: false });
        host.postMessage({ type: 'swap-loading', worktreeId: mainWt.id, loading: false });
      }
    }
  );
}
