/* eslint-disable max-lines -- TODO: decompose in a follow-up PR */
import * as vscode from 'vscode';
import * as path from 'path';
import { log } from './logger';
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
  recoverStuckTempBranch,
} from './git/worktrees';
import { getFileChanges, getBranchDiffFileChanges, getRepoFiles } from './git/status';
import { diffFileChanges } from './git/event-diff';
import { filterIgnoredFiles } from './git/ignore-filter';
import { gitQueue, gitWrite } from './git/git-utils';

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
  /** True while a status poll cycle is in progress — prevents overlapping polls. */
  private statusPollingInFlight = false;
  private disposables: vscode.Disposable[] = [];
  /** Separate tracking for per-worktree file watchers so they can be rebuilt independently. */
  private fileWatcherDisposables: vscode.Disposable[] = [];
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

    // Recover any worktrees left on a temp swap branch from a previous crash
    const recoveryResults = await Promise.all(
      this.worktrees.map((wt) => recoverStuckTempBranch(wt.path))
    );
    if (recoveryResults.some(Boolean)) {
      this.worktrees = await detectWorktrees(this.currentRoot);
    }

    // Set initial diff modes: feature branches diff against default branch,
    // worktrees on the default branch show working changes.
    for (const wt of this.worktrees) {
      wt.defaultBranch = this.defaultBranch;
      if (wt.branch === this.defaultBranch) {
        wt.diffMode = { type: 'working' };
      } else {
        wt.diffMode = { type: 'branch', branch: this.defaultBranch };
      }
      log.info(`[diffMode] init: ${wt.branch} → ${JSON.stringify(wt.diffMode)}`);
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
          log.error('loadAllFileChanges error for', wt.path, err);
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
    if (wt.diffMode.type === 'repo') {
      const branchFiles = await getRepoFiles(wt.path).then((f) => filterIgnoredFiles(f, patterns));
      return { files: [], branchFiles };
    }
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

  /**
   * Create per-worktree file watchers using RelativePattern instead of a
   * single workspace-wide `**\/*` glob.
   *
   * This mitigates the sporadic macOS "Events were dropped by the FSEvents
   * client" error by:
   *   1. Reducing FSEvents pressure — only worktree directories are watched,
   *      not the entire workspace (which may include build artifacts, other
   *      repos, etc.)
   *   2. Covering linked worktrees outside the workspace folder — the old
   *      `**\/*` glob only matched files inside workspace folders, so linked
   *      worktrees relied entirely on the 2-second status poll.
   *
   * Watchers are rebuilt automatically when the set of worktrees changes.
   */
  private setupFileWatcher(): void {
    for (const d of this.fileWatcherDisposables) d.dispose();
    this.fileWatcherDisposables = [];

    const onChange = (uri: vscode.Uri) => this.onFileSystemChange(uri);

    for (const wt of this.worktrees) {
      const pattern = new vscode.RelativePattern(vscode.Uri.file(wt.path), '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.fileWatcherDisposables.push(
        watcher,
        watcher.onDidChange(onChange),
        watcher.onDidCreate(onChange),
        watcher.onDidDelete(onChange)
      );
    }
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
        log.error('reloadAllWithFilter error for', wt.path, err);
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
        // If a write operation is in flight, reschedule instead of dropping.
        // The write will trigger another FS event when it completes, but
        // FSEvents may drop that event (the exact bug we're fixing), so we
        // must guarantee the refresh eventually runs.
        if (gitQueue.isActive()) {
          this.scheduleRefresh(wt);
          return;
        }
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
      log.error('refreshWorktree error for', wt.path, err);
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
      // Skip if the previous poll cycle hasn't finished yet — prevents
      // overlapping git processes when refreshes take longer than 2 seconds.
      if (this.statusPollingInFlight) return;
      this.statusPollingInFlight = true;
      // Refresh worktrees sequentially to avoid concurrent git processes.
      void (async () => {
        try {
          for (const wt of this.worktrees) {
            await this.refreshWorktree(wt);
          }
        } finally {
          this.statusPollingInFlight = false;
        }
      })();
    }, 2_000);
  }

  private async checkForWorktreeChanges(): Promise<void> {
    if (!this.currentRoot) return;
    try {
      const fresh = await detectWorktrees(this.currentRoot);

      // Guard: if detection returns empty but we already have worktrees, this is
      // almost certainly a transient git error (e.g. lock file during a rename/move).
      // Skip this cycle to avoid flashing "No worktrees".
      if (fresh.length === 0 && this.worktrees.length > 0) {
        log.info('checkForWorktreeChanges: detectWorktrees returned empty, skipping');
        return;
      }

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
            log.error('getFileChanges error for new worktree', wt.path, err);
          }
          const event: ShiftspaceEvent = { type: 'worktree-added', worktree: wt };
          this.postMessage({ type: 'event', event });
        }
      }

      // Branch or path changed for an existing worktree
      for (const freshWt of fresh) {
        if (!prevIds.has(freshWt.id)) continue; // already handled as new above
        const prevWt = this.worktrees.find((wt) => wt.id === freshWt.id);
        if (!prevWt) continue;

        const branchChanged = prevWt.branch !== freshWt.branch;
        const pathChanged = prevWt.path !== freshWt.path;

        if (!branchChanged && !pathChanged) continue;

        freshWt.defaultBranch = this.defaultBranch;

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
              : freshWt.branch === this.defaultBranch
                ? { type: 'working' }
                : { type: 'branch', branch: this.defaultBranch };
          try {
            const { files, branchFiles } = await this.getFilesForMode(freshWt);
            freshWt.files = files;
            freshWt.branchFiles = branchFiles;
          } catch (err) {
            log.error('getFileChanges error after branch change', freshWt.path, err);
            freshWt.files = [];
          }
          this.fileStates.set(freshWt.id, freshWt.files);

          log.info(
            `[diffMode] re-adding worktree after branch change: ${freshWt.branch} diffMode=${JSON.stringify(freshWt.diffMode)}`
          );
        } else {
          // Path changed only (rename/move) — preserve diffMode and files
          freshWt.diffMode = prevWt.diffMode;
          freshWt.files = prevWt.files;
          freshWt.branchFiles = prevWt.branchFiles;
          this.fileStates.set(freshWt.id, freshWt.files);
          log.info(`[path] worktree path changed: ${prevWt.path} → ${freshWt.path}`);
        }

        // Send a worktree-added (upsert) — no remove needed since the ID is the same.
        this.postMessage({ type: 'event', event: { type: 'worktree-added', worktree: freshWt } });
        this.onFileChange?.(freshWt.id);
      }

      // Preserve user-set diffMode for existing worktrees.
      // detectWorktrees() always returns diffMode: { type: 'working' } — without
      // this, any poll would silently reset a "vs main" or "All files" diff mode.
      // Branch-changed worktrees are already handled above with their own logic.
      for (const freshWt of fresh) {
        const prevWt = this.worktrees.find((wt) => wt.id === freshWt.id);
        if (prevWt && prevWt.branch === freshWt.branch) {
          freshWt.diffMode = prevWt.diffMode;
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

      // Rebuild per-worktree file watchers when the set of paths changes
      // (worktrees added, removed, or moved).
      const prevPaths = [...prevIds]
        .map((id) => this.worktrees.find((wt) => wt.id === id)?.path)
        .sort()
        .join('\0');
      const freshPaths = fresh
        .map((wt) => wt.path)
        .sort()
        .join('\0');

      this.worktrees = fresh;

      if (prevPaths !== freshPaths) {
        this.setupFileWatcher();
      }
    } catch (err) {
      log.error('checkForWorktreeChanges error:', err);
    }
  }

  /** Handle a diff mode change from the webview. */
  async handleSetDiffMode(worktreeId: string, diffMode: DiffMode): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;

    log.info(`[diffMode] handleSetDiffMode: ${wt.branch} → ${JSON.stringify(diffMode)}`);
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
      // Notify so insights re-run against the new file set
      this.onFileChange?.(worktreeId);
    } catch (err) {
      log.error('handleSetDiffMode error:', err);
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
      log.error('handleFetchBranches error:', err);
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
      log.error('handleGetBranchList error:', err);
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
      log.error('handleCheckoutBranch error:', err);
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

    // Signal loading state to both worktrees before starting
    this.postMessage({ type: 'swap-loading', worktreeId: linkedWt.id, loading: true });
    this.postMessage({ type: 'swap-loading', worktreeId: mainWt.id, loading: true });

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
          log.error('handleSwapBranches error:', err);
          void vscode.window.showErrorMessage(
            `Branch swap failed: ${(err as Error).message}. Check git stash list for any stashed changes.`
          );
        } finally {
          this.postMessage({ type: 'swap-loading', worktreeId: linkedWt.id, loading: false });
          this.postMessage({ type: 'swap-loading', worktreeId: mainWt.id, loading: false });
        }
      }
    );
  }

  /** Add a new worktree with an auto-generated name: {repoName}-wt{index}. */
  async handleAddWorktree(): Promise<void> {
    if (!this.currentRoot) return;

    const repoName = path.basename(this.currentRoot);
    const existingNames = new Set(this.worktrees.map((wt) => path.basename(wt.path)));

    // Primary worktree is wt0; find the next available index starting at 1.
    let index = 1;
    while (existingNames.has(`${repoName}-wt${index}`)) {
      index++;
    }

    const wtName = `${repoName}-wt${index}`;
    const parentDir = path.dirname(this.currentRoot);
    const wtPath = path.join(parentDir, wtName);

    try {
      await gitWrite(['worktree', 'add', '-b', wtName, wtPath], {
        cwd: this.currentRoot!,
        timeout: 30_000,
      });
      await this.checkForWorktreeChanges();
    } catch (err) {
      log.error('handleAddWorktree error:', err);
      void vscode.window.showErrorMessage(`Failed to add worktree: ${(err as Error).message}`);
    }
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
      log.error('handleRemoveWorktree error:', err);
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
      await moveWorktree(wt.path, newPath, this.currentRoot!);
      // Immediately update the cached worktree and notify the webview so the
      // rename is reflected without waiting for the next polling cycle.
      wt.path = newPath;
      this.postMessage({
        type: 'event',
        event: { type: 'worktree-added', worktree: wt },
      });
      // Re-detect in the background for any other side-effects.
      await this.checkForWorktreeChanges();
    } catch (err) {
      log.error('handleRenameWorktree error:', err);
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

  /** Open the clicked file in the editor, optionally jumping to a 1-indexed line. */
  async handleFileClick(worktreeId: string, filePath: string, line?: number): Promise<void> {
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

      if (line !== undefined && line >= 1) {
        // Open with selection at the target line (0-indexed for Position)
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
    for (const d of this.fileWatcherDisposables) d.dispose();
    this.fileWatcherDisposables = [];
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.worktrees = [];
    this.fileStates.clear();
  }

  /**
   * Apply persisted diff mode overrides (keyed by branch name) to the
   * current worktrees. Called after switchRepo() and before the init
   * message is sent to the webview so the correct diff mode is reflected
   * on first render. Re-fetches file data for overridden worktrees.
   */
  applyDiffModeOverrides(overrides: Record<string, DiffMode>): void {
    if (!overrides || Object.keys(overrides).length === 0) return;
    for (const wt of this.worktrees) {
      const override = overrides[wt.branch];
      if (!override) continue;
      // Skip if already matching (e.g. feature branch already defaults to "vs main")
      if (
        wt.diffMode.type === override.type &&
        (wt.diffMode.type !== 'branch' ||
          (override.type === 'branch' && wt.diffMode.branch === override.branch))
      ) {
        continue;
      }
      log.info(`[diffMode] applyOverride: ${wt.branch} → ${JSON.stringify(override)}`);
      wt.diffMode = override;
      // Re-fetch files for the new mode (fire-and-forget; init message
      // already includes the files from the initial load, and the
      // worktree-files-updated message will patch them once ready).
      void this.getFilesForMode(wt).then(({ files, branchFiles }) => {
        wt.files = files;
        wt.branchFiles = branchFiles;
        this.fileStates.set(wt.id, files);
        this.postMessage({
          type: 'worktree-files-updated',
          worktreeId: wt.id,
          files,
          diffMode: wt.diffMode,
          branchFiles,
        });
      });
    }
  }

  /** Returns current worktree snapshot (id, path, branch) for ActionManager consumption. */
  getWorktrees(): Array<{ id: string; path: string; branch: string }> {
    return this.worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }));
  }

  /** Returns the full WorktreeState array (used to initialize late-joining views). */
  getFullWorktrees(): WorktreeState[] {
    return this.worktrees;
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
