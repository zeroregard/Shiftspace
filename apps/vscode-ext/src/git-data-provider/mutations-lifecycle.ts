import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../logger';
import { removeWorktree, pruneWorktrees, moveWorktree } from '../git/worktrees';
import { gitWrite } from '../git/git-utils';
import { reportError } from '../telemetry';
import type { GitDataProvider } from './index';

/** Add a new worktree with an auto-generated name: {repoName}-wt{index}. */
export async function handleAddWorktree(host: GitDataProvider): Promise<void> {
  if (!host.currentRoot) return;

  const repoName = path.basename(host.currentRoot);
  const existingNames = new Set(host.worktrees.map((wt) => path.basename(wt.path)));

  // Primary worktree is wt0; find the next available index starting at 1.
  let index = 1;
  while (existingNames.has(`${repoName}-wt${index}`)) {
    index++;
  }

  const wtName = `${repoName}-wt${index}`;
  const parentDir = path.dirname(host.currentRoot);
  const wtPath = path.join(parentDir, wtName);
  const branchName = `${wtName}-${Date.now().toString(36)}`;

  // Instant feedback: tell the renderer we've started. The pending flag is
  // cleared automatically when the `worktree-added` event arrives (success)
  // or when we emit `worktree-add-failed` below.
  host.postMessage({ type: 'event', event: { type: 'worktree-add-pending' } });

  try {
    await gitWrite(['worktree', 'add', '-b', branchName, wtPath], {
      cwd: host.currentRoot,
      timeout: 30_000,
    });
    await host.checkForWorktreeChanges();
  } catch (err) {
    log.error('handleAddWorktree error:', err);
    reportError(err as Error, { context: 'handleAddWorktree' });
    host.postMessage({ type: 'event', event: { type: 'worktree-add-failed' } });
    void vscode.window.showErrorMessage(`Failed to add worktree: ${(err as Error).message}`);
  }
}

/**
 * Remove a linked (non-primary) worktree. Confirmation happens inline in
 * the renderer (popover on the trash icon), so this handler assumes the
 * user has already consented.
 */
export async function handleRemoveWorktree(
  host: GitDataProvider,
  worktreeId: string
): Promise<void> {
  const wt = host.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return;

  if (wt.isMainWorktree) {
    void vscode.window.showErrorMessage('Cannot remove the primary worktree.');
    return;
  }

  // Instant feedback: the card greys out / shows a spinner before the
  // (potentially queued) git command runs.
  host.postMessage({
    type: 'event',
    event: { type: 'worktree-removal-pending', worktreeId: wt.id },
  });

  // Stop watching this worktree before any filesystem mutation so the
  // subsequent rm -rf doesn't emit a flood of stale delete events.
  host.fileEvents.removeWorktree(wt.id);

  try {
    await fastRemoveWorktree(wt.path, host.currentRoot!);

    // Local bookkeeping: drop this worktree from the cache and broadcast
    // the removal. The worktree-removed event updates the renderer store;
    // the 3s worktree poll is the safety net if anything drifted.
    host.worktrees = host.worktrees.filter((w) => w.id !== wt.id);
    host.fileStates.delete(wt.id);

    host.postMessage({
      type: 'event',
      event: { type: 'worktree-removed', worktreeId: wt.id },
    });
  } catch (err) {
    log.error('handleRemoveWorktree error:', err);
    reportError(err as Error, { context: 'handleRemoveWorktree', branch: wt.branch });
    // The worktree may still be live — re-arm its watcher so file events
    // keep flowing.
    host.fileEvents.addWorktree(wt);
    host.postMessage({
      type: 'event',
      event: { type: 'worktree-removal-failed', worktreeId: wt.id },
    });
    void vscode.window.showErrorMessage(`Failed to remove worktree: ${(err as Error).message}`);
  }
}

/**
 * Fast worktree removal:
 *  1. Rename the worktree directory to a sibling `.deleting-<ts>` — atomic
 *     on the same volume, so it returns in milliseconds regardless of how
 *     large the tree is (node_modules, build artifacts, etc.).
 *  2. `git worktree prune` from the primary root to clean up git metadata.
 *  3. Fire-and-forget recursive delete of the renamed directory.
 *
 * Falls back to `git worktree remove --force` if the rename fails
 * (cross-device, EACCES, non-existent path, etc.). The confirmation popover
 * in the UI is the safety gate — we always pass `--force`.
 */
async function fastRemoveWorktree(worktreePath: string, gitRoot: string): Promise<void> {
  const tempPath = `${worktreePath}.deleting-${Date.now().toString(36)}`;
  try {
    await fs.promises.rename(worktreePath, tempPath);
  } catch (err) {
    log.info(
      `fastRemoveWorktree: rename failed (${(err as Error).message}), falling back to git worktree remove --force`
    );
    await removeWorktree(worktreePath, gitRoot, true);
    return;
  }

  try {
    await pruneWorktrees(gitRoot);
  } catch (pruneErr) {
    // Best-effort: keep going. Worst case, the next `git worktree list` run
    // will prune stale entries itself. We still want to delete the temp dir.
    log.error('fastRemoveWorktree: prune failed', pruneErr);
    reportError(pruneErr as Error, { context: 'fastRemoveWorktree.prune' });
  }

  // Background cleanup — no one is waiting on this.
  void fs.promises.rm(tempPath, { recursive: true, force: true }).catch((rmErr) => {
    log.error('fastRemoveWorktree: background rm failed', rmErr);
    reportError(rmErr as Error, { context: 'fastRemoveWorktree.backgroundRm' });
  });
}

/** Rename/move a worktree to a new path. */
export async function handleRenameWorktree(
  host: GitDataProvider,
  worktreeId: string,
  newName: string
): Promise<void> {
  const wt = host.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return;

  if (wt.isMainWorktree) {
    void vscode.window.showErrorMessage('Cannot rename the primary worktree.');
    return;
  }

  const parentDir = path.dirname(wt.path);
  const newPath = path.join(parentDir, newName);

  try {
    const oldId = wt.id;
    await moveWorktree(wt.path, newPath, host.currentRoot!);

    // Update cached worktree identity in-place
    wt.id = newPath;
    wt.path = newPath;

    // Migrate fileStates to the new key
    const prevFiles = host.fileStates.get(oldId);
    if (prevFiles) {
      host.fileStates.delete(oldId);
      host.fileStates.set(wt.id, prevFiles);
    }

    // Send a rename event so the renderer swaps IDs atomically (no exit+enter animation)
    host.postMessage({
      type: 'event',
      event: { type: 'worktree-renamed', oldWorktreeId: oldId, worktree: wt },
    });

    // Refresh the file watcher for the new path (skip full re-detect to avoid
    // the remove+add detection that causes a duplicate animation)
    host.fileEvents.removeWorktree(oldId);
    host.fileEvents.addWorktree(wt);
  } catch (err) {
    log.error('handleRenameWorktree error:', err);
    reportError(err as Error, { context: 'handleRenameWorktree', branch: wt.branch });
    void vscode.window.showErrorMessage(`Failed to rename worktree: ${(err as Error).message}`);
  }
}

/** Reveal a folder in the VS Code Explorer. */
export async function handleFolderClick(
  host: GitDataProvider,
  worktreeId: string,
  folderPath: string
): Promise<void> {
  const wt = host.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return;
  const absolutePath = path.join(wt.path, folderPath);
  await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(absolutePath));
}

/** Open the clicked file in the editor, optionally jumping to a 1-indexed line. */
export async function handleFileClick(
  host: GitDataProvider,
  worktreeId: string,
  filePath: string,
  line?: number
): Promise<void> {
  const wt = host.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return;
  const absolutePath = path.join(wt.path, filePath);
  const fileUri = vscode.Uri.file(absolutePath);
  try {
    await vscode.workspace.fs.stat(fileUri);
  } catch {
    void vscode.window.showInformationMessage(`File not found: ${filePath}`);
    return;
  }
  try {
    // Prefer a view column that doesn't contain the Shiftspace webview.
    const targetColumn = findNonShiftspaceColumn() ?? vscode.ViewColumn.Active;

    if (line !== undefined && line >= 1) {
      const position = new vscode.Position(line - 1, 0);
      const selection = new vscode.Selection(position, position);
      await vscode.commands.executeCommand('vscode.open', fileUri, {
        preview: true,
        viewColumn: targetColumn,
        selection,
      });
    } else {
      await vscode.commands.executeCommand('vscode.open', fileUri, {
        preview: true,
        viewColumn: targetColumn,
      });
    }
  } catch (err) {
    log.error('handleFileClick error:', err);
    reportError(err as Error, { context: 'handleFileClick' });
  }
}

/**
 * Read the worktree's `planPath` file and post its contents back to the
 * webview. Cap at 64 KB — the tooltip preview is a hover glance, not a full
 * editor, and we don't want to ship megabytes through postMessage.
 */
const PLAN_PREVIEW_MAX_BYTES = 64 * 1024;

export async function handleLoadPlanContent(
  host: GitDataProvider,
  worktreeId: string
): Promise<void> {
  const wt = host.worktrees.find((w) => w.id === worktreeId);
  if (!wt || !wt.planPath) return;

  const planPath = wt.planPath;
  const absolutePath = path.join(wt.path, planPath);

  try {
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) {
      host.postMessage({
        type: 'plan-content',
        worktreeId: wt.id,
        planPath,
        status: 'missing',
      });
      return;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      host.postMessage({
        type: 'plan-content',
        worktreeId: wt.id,
        planPath,
        status: 'missing',
      });
      return;
    }
    log.error('handleLoadPlanContent stat error:', err);
    host.postMessage({
      type: 'plan-content',
      worktreeId: wt.id,
      planPath,
      status: 'error',
      message: (err as Error).message,
    });
    return;
  }

  try {
    const handle = await fs.promises.open(absolutePath, 'r');
    try {
      const buffer = Buffer.alloc(PLAN_PREVIEW_MAX_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const truncated = bytesRead > PLAN_PREVIEW_MAX_BYTES;
      const content = buffer
        .subarray(0, Math.min(bytesRead, PLAN_PREVIEW_MAX_BYTES))
        .toString('utf8');
      host.postMessage({
        type: 'plan-content',
        worktreeId: wt.id,
        planPath,
        status: 'loaded',
        content,
        truncated,
      });
    } finally {
      await handle.close();
    }
  } catch (err) {
    log.error('handleLoadPlanContent read error:', err);
    reportError(err as Error, { context: 'handleLoadPlanContent' });
    host.postMessage({
      type: 'plan-content',
      worktreeId: wt.id,
      planPath,
      status: 'error',
      message: (err as Error).message,
    });
  }
}

/** Returns the view column of a tab group that has no Shiftspace webview tab, or undefined. */
function findNonShiftspaceColumn(): vscode.ViewColumn | undefined {
  for (const group of vscode.window.tabGroups.all) {
    const hasShiftspace = group.tabs.some(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('shiftspace')
    );
    if (!hasShiftspace) {
      return group.viewColumn;
    }
  }
  return undefined;
}
