import * as vscode from 'vscode';
import * as path from 'path';
import type { WorktreeState, ShiftspaceEvent, DiffMode, FileChange } from '@shiftspace/renderer';
import {
  detectWorktrees,
  checkGitAvailability,
  getDefaultBranch,
  listBranches,
} from './git/worktrees';
import { getFileChanges, getBranchDiffFileChanges } from './git/status';
import { diffFileChanges } from './git/eventDiff';

type PostMessage = (msg: object) => void;

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
  private disposables: vscode.Disposable[] = [];
  private currentRoot: string | undefined;
  private defaultBranch = 'main';

  constructor(private readonly postMessage: PostMessage) {}

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
    this.startWorktreePolling();
  }

  private async loadAllFileChanges(): Promise<void> {
    await Promise.allSettled(
      this.worktrees.map(async (wt) => {
        try {
          const files = await this.getFilesForMode(wt);
          wt.files = files;
          this.fileStates.set(wt.id, files);
        } catch (err) {
          console.error('[Shiftspace] loadAllFileChanges error for', wt.path, err);
        }
      })
    );
  }

  /** Get files using the appropriate diff strategy for the worktree's current mode. */
  private async getFilesForMode(wt: WorktreeState): Promise<FileChange[]> {
    const mode = wt.diffMode;
    if (mode.type === 'branch') {
      return getBranchDiffFileChanges(wt.path, mode.branch);
    }
    return getFileChanges(wt.path);
  }

  /** Returns debounce duration based on the worktree's diff mode. */
  private getDebounceMs(wt: WorktreeState): number {
    return wt.diffMode.type === 'working' ? 500 : 2500;
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
        void this.refreshWorktree(wt);
      }, this.getDebounceMs(wt))
    );
  }

  private async refreshWorktree(wt: WorktreeState): Promise<void> {
    try {
      const newFiles = await this.getFilesForMode(wt);
      const prevFiles = this.fileStates.get(wt.id) ?? [];
      const events = diffFileChanges(wt.id, prevFiles, newFiles);

      wt.files = newFiles;
      this.fileStates.set(wt.id, newFiles);

      for (const event of events) {
        this.postMessage({ type: 'event', event });
      }
    } catch (err) {
      console.error('[Shiftspace] refreshWorktree error for', wt.path, err);
    }
  }

  private startWorktreePolling(): void {
    this.worktreePollingTimer = setInterval(() => {
      void this.checkForWorktreeChanges();
    }, 15_000);
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
            wt.files = await this.getFilesForMode(wt);
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
          freshWt.files = await this.getFilesForMode(freshWt);
        } catch (err) {
          console.error('[Shiftspace] getFileChanges error after branch change', freshWt.path, err);
          freshWt.files = [];
        }
        this.fileStates.set(freshWt.id, freshWt.files);

        this.postMessage({ type: 'event', event: { type: 'worktree-added', worktree: freshWt } });
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
      const files = await this.getFilesForMode(wt);
      wt.files = files;
      this.fileStates.set(worktreeId, files);
      this.postMessage({ type: 'worktree-files-updated', worktreeId, files, diffMode });
    } catch (err) {
      console.error('[Shiftspace] handleSetDiffMode error:', err);
      // Send back empty to clear loading state
      this.postMessage({ type: 'worktree-files-updated', worktreeId, files: [], diffMode });
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
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.worktrees = [];
    this.fileStates.clear();
  }

  dispose(): void {
    this.tearDownWatchers();
  }
}
