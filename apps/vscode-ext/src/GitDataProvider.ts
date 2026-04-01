import * as vscode from 'vscode';
import * as path from 'path';
import type { WorktreeState, ShiftspaceEvent, DiffMode, FileChange } from '@shiftspace/renderer';
import {
  detectWorktrees,
  checkGitAvailability,
  getDefaultBranch,
  listBranches,
  checkoutBranch,
  fetchRemote,
  checkWorktreeSafety,
  swapBranches,
  removeWorktree,
  moveWorktree,
} from './git/worktrees';
import { getFileChanges, getBranchDiffFileChanges } from './git/status';
import { diffFileChanges } from './git/eventDiff';
import { filterIgnoredFiles } from './git/ignoreFilter';
import { gitQueue } from './git/gitUtils';

type PostMessage = (msg: object) => void;
type OnFileChange = (worktreeId: string) => void;

function getIgnorePatterns(): string[] {
  const config = vscode.workspace.getConfiguration('shiftspace');
  return config.get<string[]>('ignorePatterns', []);
}

const IGNORED_SEGMENTS = ['.git', 'node_modules'];

function isIgnoredPath(fsPath: string): boolean {
  return IGNORED_SEGMENTS.some((seg) => fsPath.includes(`${path.sep}${seg}${path.sep}`));
}

function findWorktreeForPath(
  worktrees: WorktreeState[],
  fsPath: string
): WorktreeState | undefined {
  // Find the most-specific (longest-path) worktree that contains the file
  return worktrees
    .filter((wt) => fsPath.startsWith(wt.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * Orchestrates real-git-data gathering for the Shiftspace webview.
 *
 * Lifecycle:
 *  1. Call `switchRepo(gitRoot)` to start tracking a repo (or switch to another).
 *  2. Filesystem watcher emits surgical `event` messages as files change.
 *  3. Call `dispose()` when the view is closed.
 */
export class GitDataProvider implements vscode.Disposable {
  private worktrees: WorktreeState[] = [];
  private fileStates = new Map<string, WorktreeState['files']>(); // worktreeId → files
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private worktreePollingTimer: ReturnType<typeof setInterval> | undefined;
  private statusPollingTimer: ReturnType<typeof setInterval> | undefined;
  private disposables: vscode.Disposable[] = [];
  private currentRoot: string | undefined;
  private defaultBranch = 'main';

  constructor(
    private readonly postMessage: PostMessage,
    private readonly onFileChange?: OnFileChange
  ) {}

  /**
   * Switch to tracking a different git repo root.
   * No-ops if the root hasn't changed. Tears down existing watchers first.
   */
  async switchRepo(gitRoot: string): Promise<void> {
    if (gitRoot === this.currentRoot) return;
    this.tearDownWatchers();
    this.currentRoot = gitRoot;
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.currentRoot) return;

    const gitStatus = await checkGitAvailability(this.currentRoot);

    if (gitStatus === 'no-git') {
      this.postMessage({ type: 'error', message: 'Git is not available' });
      return;
    }
    if (gitStatus === 'not-repo') {
      this.postMessage({
        type: 'error',
        message: 'This workspace is not a git repository',
      });
      return;
    }

    this.defaultBranch = await getDefaultBranch(this.currentRoot);
    this.worktrees = await detectWorktrees(this.currentRoot);

    // Set initial diff modes: feature branches diff against default branch,
    // worktrees on the default branch show working changes.
    for (const wt of this.worktrees) {
      wt.defaultBranch = this.defaultBranch;
      if (wt.branch === this.defaultBranch) {
        wt.diffMode = { type: 'working' };
      } else {
        wt.diffMode = { type: 'branch', branch: this.defaultBranch };
      }
    }

    await this.loadAllFileChanges();

    this.postMessage({ type: 'init', worktrees: this.worktrees });
    this.setupFileWatcher();
    this.setupHeadWatcher();
    this.setupIndexWatcher();
    this.setupConfigWatcher();
    this.startWorktreePolling();
    this.startStatusPolling();
  }

  private async loadAllFileChanges(): Promise<void> {
    await Promise.allSettled(
      this.worktrees.map(async (wt) => {
        try {
          const { files, branchFiles } = await this.getFilesForMode(wt);
          wt.files = files;
          wt.branchFiles = branchFiles;
          this.fileStates.set(wt.id, files);
        } catch (err) {
          console.error('[Shiftspace] loadAllFileChanges error for', wt.path, err);
        }
      })
    );
  }

  /**
   * Fetch the working-tree files (staged/unstaged) and, in branch mode, the
   * committed branch-diff files separately.
   *
   * - `files`       → always the current git status (staged + unstaged working changes)
   * - `branchFiles` → only in branch mode: commits on this branch vs the base
   */
  private async getFilesForMode(
    wt: WorktreeState
  ): Promise<{ files: FileChange[]; branchFiles?: FileChange[] }> {
    const patterns = getIgnorePatterns();
    if (wt.diffMode.type === 'branch') {
      // Run sequentially to avoid concurrent git processes on the same repo
      const files = await getFileChanges(wt.path).then((f) => filterIgnoredFiles(f, patterns));
      const branchFiles = await getBranchDiffFileChanges(wt.path, wt.diffMode.branch).then((f) =>
        filterIgnoredFiles(f, patterns)
      );
      return { files, branchFiles };
    }
    const files = await getFileChanges(wt.path).then((f) => filterIgnoredFiles(f, patterns));
    return { files };
  }

  /** Returns debounce duration based on the worktree's diff mode. */
  private getDebounceMs(_wt: WorktreeState): number {
    // 1 second gives the user time to finish their git operation before we
    // issue our own read-only queries.
    return 1000;
  }

  private setupFileWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    const onChange = (uri: vscode.Uri) => this.onFileSystemChange(uri);
    this.disposables.push(
      watcher,
      watcher.onDidChange(onChange),
      watcher.onDidCreate(onChange),
      watcher.onDidDelete(onChange)
    );
  }

  /**
   * Watch .git/HEAD and .git/worktrees/*\/HEAD so branch checkouts are
   * reflected immediately instead of waiting for the 15-second poll.
   */
  private setupHeadWatcher(): void {
    if (!this.currentRoot) return;
    const gitDir = path.join(this.currentRoot, '.git');
    const onHeadChange = () => void this.checkForWorktreeChanges();

    const mainHead = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'HEAD')
    );
    const linkedHeads = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'worktrees/*/HEAD')
    );

    this.disposables.push(
      mainHead,
      mainHead.onDidChange(onHeadChange),
      linkedHeads,
      linkedHeads.onDidChange(onHeadChange)
    );
  }

  /**
   * Watch .git/index and .git/worktrees/*\/index so that staging/unstaging
   * is reflected immediately. The file content watcher ignores .git/ paths,
   * so without this, staging never triggers a refresh.
   */
  private setupIndexWatcher(): void {
    if (!this.currentRoot) return;
    const gitDir = path.join(this.currentRoot, '.git');

    const onIndexChange = () => {
      for (const wt of this.worktrees) {
        this.scheduleRefresh(wt);
      }
    };

    const mainIndex = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'index')
    );
    const linkedIndexes = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'worktrees/*/index')
    );

    this.disposables.push(
      mainIndex,
      mainIndex.onDidChange(onIndexChange),
      linkedIndexes,
      linkedIndexes.onDidChange(onIndexChange)
    );
  }

  private setupConfigWatcher(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('shiftspace.ignorePatterns')) {
          void this.reloadAllWithFilter();
        }
      })
    );
  }

  private async reloadAllWithFilter(): Promise<void> {
    for (const wt of this.worktrees) {
      try {
        const { files: newFiles, branchFiles } = await this.getFilesForMode(wt);
        const prevFiles = this.fileStates.get(wt.id) ?? [];
        const events = diffFileChanges(wt.id, prevFiles, newFiles);
        wt.files = newFiles;
        wt.branchFiles = branchFiles;
        this.fileStates.set(wt.id, newFiles);
        for (const event of events) {
          this.postMessage({ type: 'event', event });
        }
      } catch (err) {
        console.error('[Shiftspace] reloadAllWithFilter error for', wt.path, err);
      }
    }
  }

  private onFileSystemChange(uri: vscode.Uri): void {
    if (isIgnoredPath(uri.fsPath)) return;
    const wt = findWorktreeForPath(this.worktrees, uri.fsPath);
    if (!wt) return;
    this.scheduleRefresh(wt);
  }

  private scheduleRefresh(wt: WorktreeState): void {
    const existing = this.debounceTimers.get(wt.id);
    if (existing !== undefined) clearTimeout(existing);
    this.debounceTimers.set(
      wt.id,
      setTimeout(() => {
        this.debounceTimers.delete(wt.id);
        // Skip if a write operation is in flight — it will trigger another
        // filesystem event when it completes, which will re-schedule us.
        if (gitQueue.isActive()) return;
        void this.refreshWorktree(wt);
      }, this.getDebounceMs(wt))
    );
  }

  private async refreshWorktree(wt: WorktreeState): Promise<void> {
    try {
      const { files: newFiles, branchFiles } = await this.getFilesForMode(wt);
      const prevFiles = this.fileStates.get(wt.id) ?? [];
      const events = diffFileChanges(wt.id, prevFiles, newFiles);

      // Detect branchFiles changes (e.g. after a commit)
      const prevBranch = wt.branchFiles ?? [];
      const newBranch = branchFiles ?? [];
      const branchChanged = diffFileChanges(wt.id, prevBranch, newBranch).length > 0;

      wt.files = newFiles;
      wt.branchFiles = branchFiles;
      this.fileStates.set(wt.id, newFiles);

      for (const event of events) {
        this.postMessage({ type: 'event', event });
      }

      // Notify stale callback if working files or branch diff changed
      if (events.length > 0 || branchChanged) {
        this.onFileChange?.(wt.id);
      }
    } catch (err) {
      console.error('[Shiftspace] refreshWorktree error for', wt.path, err);
    }
  }

  private startWorktreePolling(): void {
    // Poll every 3 seconds so branch switches (e.g. by agents) are reflected
    // quickly. The HEAD watcher is unreliable on some platforms because git
    // uses atomic lock-file renames that VSCode's file watcher can miss.
    this.worktreePollingTimer = setInterval(() => {
      void this.checkForWorktreeChanges();
    }, 3_000);
  }

  /**
   * Poll git status every 2 seconds as a reliable fallback for staging changes.
   * VSCode's file watcher does not reliably detect `.git/index` writes on macOS
   * (git uses an atomic lock-file rename), so the index watcher alone isn't enough.
   */
  private startStatusPolling(): void {
    this.statusPollingTimer = setInterval(() => {
      // Skip poll tick entirely while a write operation is queued/running.
      if (gitQueue.isActive()) return;
      // Refresh worktrees sequentially to avoid concurrent git processes.
      void (async () => {
        for (const wt of this.worktrees) {
          await this.refreshWorktree(wt);
        }
      })();
    }, 2_000);
  }

  private async checkForWorktreeChanges(): Promise<void> {
    if (!this.currentRoot) return;
    try {
      const fresh = await detectWorktrees(this.currentRoot);
      const prevIds = new Set(this.worktrees.map((wt) => wt.id));
      const freshIds = new Set(fresh.map((wt) => wt.id));

      // Removed worktrees
      for (const wt of this.worktrees) {
        if (!freshIds.has(wt.id)) {
          const event: ShiftspaceEvent = { type: 'worktree-removed', worktreeId: wt.id };
          this.postMessage({ type: 'event', event });
        }
      }

      // Added worktrees
      for (const wt of fresh) {
        if (!prevIds.has(wt.id)) {
          wt.defaultBranch = this.defaultBranch;
          if (wt.branch === this.defaultBranch) {
            wt.diffMode = { type: 'working' };
          } else {
            wt.diffMode = { type: 'branch', branch: this.defaultBranch };
          }
          try {
            const { files, branchFiles } = await this.getFilesForMode(wt);
            wt.files = files;
            wt.branchFiles = branchFiles;
          } catch (err) {
            console.error('[Shiftspace] getFileChanges error for new worktree', wt.path, err);
          }
          const event: ShiftspaceEvent = { type: 'worktree-added', worktree: wt };
          this.postMessage({ type: 'event', event });
        }
      }

      // Branch changed for an existing worktree (e.g. `git checkout <branch>` in terminal)
      for (const freshWt of fresh) {
        if (!prevIds.has(freshWt.id)) continue; // already handled as new above
        const prevWt = this.worktrees.find((wt) => wt.id === freshWt.id);
        if (!prevWt || prevWt.branch === freshWt.branch) continue;

        // Emit remove then re-add with updated branch + files so the UI refreshes cleanly
        this.postMessage({
          type: 'event',
          event: { type: 'worktree-removed', worktreeId: prevWt.id },
        });

        freshWt.defaultBranch = this.defaultBranch;
        freshWt.diffMode =
          freshWt.branch === this.defaultBranch
            ? { type: 'working' }
            : { type: 'branch', branch: this.defaultBranch };
        try {
          const { files, branchFiles } = await this.getFilesForMode(freshWt);
          freshWt.files = files;
          freshWt.branchFiles = branchFiles;
        } catch (err) {
          console.error('[Shiftspace] getFileChanges error after branch change', freshWt.path, err);
          freshWt.files = [];
        }
        this.fileStates.set(freshWt.id, freshWt.files);

        this.postMessage({ type: 'event', event: { type: 'worktree-added', worktree: freshWt } });
        this.onFileChange?.(freshWt.id);
      }

      // Preserve user-set diffMode for worktrees whose branch hasn't changed.
      // detectWorktrees() always returns diffMode: { type: 'working' } — without
      // this, any 15-second poll would silently reset a "vs main" diff mode back
      // to working changes.
      for (const freshWt of fresh) {
        const prevWt = this.worktrees.find((wt) => wt.id === freshWt.id);
        if (prevWt && prevWt.branch === freshWt.branch) {
          freshWt.diffMode = prevWt.diffMode;
        }
      }

      this.worktrees = fresh;
    } catch (err) {
      console.error('[Shiftspace] checkForWorktreeChanges error:', err);
    }
  }

  /** Handle a diff mode change from the webview. */
  async handleSetDiffMode(worktreeId: string, diffMode: DiffMode): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;

    wt.diffMode = diffMode;

    try {
      const { files, branchFiles } = await this.getFilesForMode(wt);
      wt.files = files;
      wt.branchFiles = branchFiles;
      this.fileStates.set(worktreeId, files);
      this.postMessage({
        type: 'worktree-files-updated',
        worktreeId,
        files,
        diffMode,
        branchFiles,
      });
    } catch (err) {
      console.error('[Shiftspace] handleSetDiffMode error:', err);
      // Send back empty to clear loading state
      this.postMessage({ type: 'worktree-files-updated', worktreeId, files: [], diffMode });
    }
  }

  /** Run git fetch --all --prune and refresh the branch list. */
  async handleFetchBranches(worktreeId: string): Promise<void> {
    if (!this.currentRoot) return;
    this.postMessage({ type: 'fetch-loading', worktreeId, loading: true });
    try {
      await fetchRemote(this.currentRoot);
      const branches = await listBranches(this.currentRoot);
      this.postMessage({ type: 'fetch-done', worktreeId, timestamp: Date.now(), branches });
    } catch (err) {
      console.error('[Shiftspace] handleFetchBranches error:', err);
      this.postMessage({ type: 'fetch-loading', worktreeId, loading: false });
    }
  }

  /** Handle a branch list request from the webview. */
  async handleGetBranchList(worktreeId: string): Promise<void> {
    if (!this.currentRoot) return;
    try {
      const branches = await listBranches(this.currentRoot);
      this.postMessage({ type: 'branch-list', worktreeId, branches });
    } catch (err) {
      console.error('[Shiftspace] handleGetBranchList error:', err);
    }
  }

  /** Checkout a different branch in the given worktree, then re-initialise. */
  async handleCheckoutBranch(worktreeId: string, branch: string): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;
    try {
      await checkoutBranch(wt.path, branch);
      // Re-detect so the branch name and files reflect the new HEAD.
      await this.initialize();
    } catch (err) {
      console.error('[Shiftspace] handleCheckoutBranch error:', err);
      void vscode.window.showErrorMessage(
        `Failed to checkout "${branch}": ${(err as Error).message}`
      );
    }
  }

  /** Swap branches between the given linked worktree and the primary worktree. */
  async handleSwapBranches(worktreeId: string): Promise<void> {
    const linkedWt = this.worktrees.find((w) => w.id === worktreeId);
    if (!linkedWt) return;

    const mainWt = this.worktrees.find((w) => w.isMainWorktree && w.id !== worktreeId);
    if (!mainWt) {
      void vscode.window.showErrorMessage(`Cannot swap: primary worktree not found.`);
      return;
    }

    // Safety checks
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

    // Confirmation dialog
    const answer = await vscode.window.showInformationMessage(
      `Swap branches? This worktree (${linkedWt.branch}) will get ${mainWt.branch}'s branch, and primary worktree will get ${linkedWt.branch}. Uncommitted changes will be stashed and restored.`,
      { modal: true },
      'Yes'
    );
    if (answer !== 'Yes') return;

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
          await this.initialize();
        } catch (err) {
          console.error('[Shiftspace] handleSwapBranches error:', err);
          void vscode.window.showErrorMessage(
            `Branch swap failed: ${(err as Error).message}. Check git stash list for any stashed changes.`
          );
        }
      }
    );
  }

  /** Remove a linked (non-primary) worktree. */
  async handleRemoveWorktree(worktreeId: string): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;

    if (wt.isMainWorktree) {
      void vscode.window.showErrorMessage('Cannot remove the primary worktree.');
      return;
    }

    const wtName = wt.path.split('/').pop() ?? wt.path;
    const answer = await vscode.window.showWarningMessage(
      `Delete worktree "${wtName}" (${wt.branch})? This will remove the worktree directory. Uncommitted changes will be lost.`,
      { modal: true },
      'Delete'
    );
    if (answer !== 'Delete') return;

    try {
      try {
        await removeWorktree(wt.path, false);
      } catch {
        // Retry with --force if normal remove fails (e.g. uncommitted changes)
        await removeWorktree(wt.path, true);
      }
      // Re-detect worktrees to update the UI
      await this.checkForWorktreeChanges();
    } catch (err) {
      console.error('[Shiftspace] handleRemoveWorktree error:', err);
      void vscode.window.showErrorMessage(`Failed to remove worktree: ${(err as Error).message}`);
    }
  }

  /** Rename/move a worktree to a new path. */
  async handleRenameWorktree(worktreeId: string, newName: string): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;

    if (wt.isMainWorktree) {
      void vscode.window.showErrorMessage('Cannot rename the primary worktree.');
      return;
    }

    const parentDir = path.dirname(wt.path);
    const newPath = path.join(parentDir, newName);

    try {
      await moveWorktree(wt.path, newPath);
      // Re-detect worktrees to update the UI
      await this.checkForWorktreeChanges();
    } catch (err) {
      console.error('[Shiftspace] handleRenameWorktree error:', err);
      void vscode.window.showErrorMessage(`Failed to rename worktree: ${(err as Error).message}`);
    }
  }

  /** Reveal a folder in the VS Code Explorer. */
  async handleFolderClick(worktreeId: string, folderPath: string): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;
    const absolutePath = path.join(wt.path, folderPath);
    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(absolutePath));
  }

  /** Open the clicked file in the editor. */
  async handleFileClick(worktreeId: string, filePath: string): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
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
      // Walk tab groups to find a group with at least one non-Shiftspace tab.
      const targetColumn = this.findNonShiftspaceColumn() ?? vscode.ViewColumn.Active;
      await vscode.commands.executeCommand('vscode.open', fileUri, {
        preview: true,
        viewColumn: targetColumn,
      });
    } catch (err) {
      console.error('[Shiftspace] handleFileClick error:', err);
    }
  }

  /** Returns the view column of a tab group that has no Shiftspace webview tab, or undefined. */
  private findNonShiftspaceColumn(): vscode.ViewColumn | undefined {
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

  /** Tear down watchers and polling without destroying the instance. */
  private tearDownWatchers(): void {
    if (this.worktreePollingTimer !== undefined) {
      clearInterval(this.worktreePollingTimer);
      this.worktreePollingTimer = undefined;
    }
    if (this.statusPollingTimer !== undefined) {
      clearInterval(this.statusPollingTimer);
      this.statusPollingTimer = undefined;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.worktrees = [];
    this.fileStates.clear();
  }

  /** Returns current worktree snapshot (id, path, branch) for ActionManager consumption. */
  getWorktrees(): Array<{ id: string; path: string; branch: string }> {
    return this.worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }));
  }

  /** Returns the current FileChange list for a worktree (both files and branchFiles merged). */
  getWorktreeFiles(worktreeId: string): import('@shiftspace/renderer').FileChange[] {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return [];
    const all = [...wt.files];
    if (wt.branchFiles) all.push(...wt.branchFiles);
    return all;
  }

  /**
   * Returns all currently tracked file paths (relative to each worktree root)
   * across all worktrees. Used by IconThemeProvider to pre-resolve icons.
   */
  getAllFilePaths(): string[] {
    const paths: string[] = [];
    for (const wt of this.worktrees) {
      for (const f of wt.files) {
        paths.push(f.path);
      }
    }
    return paths;
  }

  dispose(): void {
    this.tearDownWatchers();
  }
}
