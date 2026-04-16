/* eslint-disable max-lines -- TODO: decompose in a follow-up PR */
import * as vscode from 'vscode';
import * as path from 'path';
import { log } from './logger';
import type { WorktreeState, ShiftspaceEvent, DiffMode, FileChange } from '@shiftspace/renderer';
import * as fs from 'fs';
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
  pruneWorktrees,
  moveWorktree,
  recoverStuckTempBranch,
  badgesEqual,
  WORKTREE_CONFIG_FILENAME,
} from './git/worktrees';
import { getFileChanges, getBranchDiffFileChanges, getRepoFiles } from './git/status';
import { diffFileChanges } from './git/event-diff';
import { filterIgnoredFiles } from './git/ignore-filter';
import { gitQueue, gitWrite } from './git/git-utils';
import { reportError, reportUnexpectedState } from './telemetry';

type PostMessage = (msg: object) => void;
type OnFileChange = (worktreeId: string) => void;

/**
 * Copy `lastChangedAt` from `prev` onto unchanged files in `next` so the
 * timestamp reflects the last real change rather than the last poll tick.
 * Files whose tracked fields (status/staged/linesAdded/linesRemoved) match
 * are considered unchanged; changed or new files keep their fresh timestamp.
 */
function preserveLastChangedAt(prev: FileChange[], next: FileChange[]): FileChange[] {
  if (prev.length === 0) return next;
  const prevMap = new Map(prev.map((f) => [f.path, f]));
  return next.map((f) => {
    const p = prevMap.get(f.path);
    if (
      p &&
      p.status === f.status &&
      p.staged === f.staged &&
      p.linesAdded === f.linesAdded &&
      p.linesRemoved === f.linesRemoved
    ) {
      return { ...f, lastChangedAt: p.lastChangedAt };
    }
    return f;
  });
}

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

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
  /**
   * Per-worktree file watcher disposables, keyed by worktree id. Tracking
   * them individually lets us dispose just one worktree's watcher on delete
   * instead of tearing down and rebuilding every watcher.
   */
  private fileWatchersByWorktree = new Map<string, vscode.Disposable[]>();
  private currentRoot: string | undefined;
  private defaultBranch = 'main';

  constructor(
    private readonly postMessage: PostMessage,
    private readonly onFileChange?: OnFileChange
  ) {}

  /**
   * Switch to tracking a different git repo root.
   * No-ops if the root hasn't changed. Tears down existing watchers first.
   *
   * `diffModeOverrides` (keyed by branch name) is applied BEFORE the initial
   * file fetch so the first `init` message sent to the webview already
   * reflects the persisted per-branch selection — preventing the inspection
   * view from flashing empty when it reopens with a non-default diff mode.
   */
  async switchRepo(
    gitRoot: string,
    diffModeOverrides: Record<string, DiffMode> = {}
  ): Promise<void> {
    if (gitRoot === this.currentRoot) return;
    this.tearDownWatchers();
    this.currentRoot = gitRoot;
    await this.initialize(diffModeOverrides);
  }

  private async initialize(diffModeOverrides: Record<string, DiffMode> = {}): Promise<void> {
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
    // worktrees on the default branch show working changes. Persisted
    // per-branch overrides win so the first file fetch matches the selector
    // the user will see on open.
    for (const wt of this.worktrees) {
      wt.defaultBranch = this.defaultBranch;
      const override = diffModeOverrides[wt.branch];
      if (override) {
        wt.diffMode = override;
        log.info(`[diffMode] init override: ${wt.branch} → ${JSON.stringify(override)}`);
      } else if (wt.branch === this.defaultBranch) {
        wt.diffMode = { type: 'working' };
        log.info(`[diffMode] init: ${wt.branch} → ${JSON.stringify(wt.diffMode)}`);
      } else {
        wt.diffMode = { type: 'branch', branch: this.defaultBranch };
        log.info(`[diffMode] init: ${wt.branch} → ${JSON.stringify(wt.diffMode)}`);
      }
    }

    await this.loadAllFileChanges();

    this.postMessage({ type: 'init', worktrees: this.worktrees });
    this.setupFileWatcher();
    this.setupHeadWatcher();
    this.setupIndexWatcher();
    this.setupConfigWatcher();
    this.setupWorktreeBadgeWatcher();
    this.startWorktreePolling();
    this.startStatusPolling();
  }

  /**
   * Watch `.shiftspace-worktree.json` across all workspace folders so that
   * agent-written badge updates propagate without waiting for the 3-second
   * worktree poll. Linked worktrees outside any workspace folder are still
   * covered by the poll.
   */
  private setupWorktreeBadgeWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${WORKTREE_CONFIG_FILENAME}`);
    const onBadgeChange = () => void this.checkForWorktreeChanges();
    this.disposables.push(
      watcher,
      watcher.onDidChange(onBadgeChange),
      watcher.onDidCreate(onBadgeChange),
      watcher.onDidDelete(onBadgeChange)
    );
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
          reportError(err as Error, { context: 'loadAllFileChanges', branch: wt.branch });
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
   *
   * Pass `mode` explicitly to fetch for a prospective mode without mutating
   * `wt.diffMode` first — callers that need atomic fetch-then-commit (e.g.
   * applyDiffModeOverrides, handleSetDiffMode) rely on this so the shared
   * worktree state is never left with a new diffMode and stale branchFiles.
   */
  private async getFilesForMode(
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
    for (const [, disposables] of this.fileWatchersByWorktree) {
      for (const d of disposables) d.dispose();
    }
    this.fileWatchersByWorktree.clear();

    for (const wt of this.worktrees) {
      this.addFileWatcherForWorktree(wt);
    }
  }

  /** Create and register a file watcher for a single worktree. */
  private addFileWatcherForWorktree(wt: WorktreeState): void {
    if (this.fileWatchersByWorktree.has(wt.id)) return;
    const onChange = (uri: vscode.Uri) => this.onFileSystemChange(uri);
    const pattern = new vscode.RelativePattern(vscode.Uri.file(wt.path), '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.fileWatchersByWorktree.set(wt.id, [
      watcher,
      watcher.onDidChange(onChange),
      watcher.onDidCreate(onChange),
      watcher.onDidDelete(onChange),
    ]);
  }

  /** Dispose the file watcher for a single worktree. Safe to call for unknown ids. */
  private disposeFileWatcherForWorktree(worktreeId: string): void {
    const disposables = this.fileWatchersByWorktree.get(worktreeId);
    if (!disposables) return;
    for (const d of disposables) d.dispose();
    this.fileWatchersByWorktree.delete(worktreeId);
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
        const { files: rawNewFiles, branchFiles: rawBranchFiles } = await this.getFilesForMode(wt);
        const prevFiles = this.fileStates.get(wt.id) ?? [];
        const newFiles = preserveLastChangedAt(prevFiles, rawNewFiles);
        const branchFiles = rawBranchFiles
          ? preserveLastChangedAt(wt.branchFiles ?? [], rawBranchFiles)
          : rawBranchFiles;
        const events = diffFileChanges(wt.id, prevFiles, newFiles);
        wt.files = newFiles;
        wt.branchFiles = branchFiles;
        this.fileStates.set(wt.id, newFiles);
        for (const event of events) {
          this.postMessage({ type: 'event', event });
        }
      } catch (err) {
        log.error('reloadAllWithFilter error for', wt.path, err);
        reportError(err as Error, { context: 'reloadAllWithFilter', branch: wt.branch });
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
      const { files: rawNewFiles, branchFiles: rawBranchFiles } = await this.getFilesForMode(wt);
      const prevFiles = this.fileStates.get(wt.id) ?? [];

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
      this.fileStates.set(wt.id, newFiles);

      for (const event of events) {
        this.postMessage({ type: 'event', event });
      }

      // branchFiles changed with no working-file events = commit happened.
      // Surface it as worktree activity so the timestamp bumps even though
      // the working tree is clean. File events already bump activity via
      // the reducer, so we only emit here when events.length === 0.
      if (branchChanged && events.length === 0) {
        const now = Date.now();
        wt.lastActivityAt = now;
        this.postMessage({
          type: 'event',
          event: { type: 'worktree-activity', worktreeId: wt.id, timestamp: now },
        });
      } else if (events.length > 0) {
        // Keep the provider's WorktreeState in sync with the reducer's rule
        // (file events bump activity). Use the max file lastChangedAt.
        let maxTs = wt.lastActivityAt;
        for (const f of newFiles) if (f.lastChangedAt > maxTs) maxTs = f.lastChangedAt;
        wt.lastActivityAt = maxTs;
      }

      // Notify stale callback if working files or branch diff changed
      if (events.length > 0 || branchChanged) {
        this.onFileChange?.(wt.id);
      }
    } catch (err) {
      log.error('refreshWorktree error for', wt.path, err);
      reportError(err as Error, { context: 'refreshWorktree', branch: wt.branch });
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
        // Surface this as a recoverable unexpected state — we'd like to know
        // how often the porcelain output is flaky during normal usage.
        reportUnexpectedState('git.detectWorktrees.transientEmpty', {
          previousCount: String(this.worktrees.length),
        });
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
            reportError(err as Error, {
              context: 'getFileChanges.newWorktree',
              branch: wt.branch,
            });
          }
          const event: ShiftspaceEvent = { type: 'worktree-added', worktree: wt };
          this.postMessage({ type: 'event', event });
        }
      }

      // Branch, path, or badge changed for an existing worktree
      for (const freshWt of fresh) {
        if (!prevIds.has(freshWt.id)) continue; // already handled as new above
        const prevWt = this.worktrees.find((wt) => wt.id === freshWt.id);
        if (!prevWt) continue;

        const branchChanged = prevWt.branch !== freshWt.branch;
        const pathChanged = prevWt.path !== freshWt.path;
        const badgeChanged = !badgesEqual(prevWt.badge, freshWt.badge);

        if (!branchChanged && !pathChanged && !badgeChanged) continue;

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
            reportError(err as Error, {
              context: 'getFileChanges.branchChanged',
              branch: freshWt.branch,
            });
            freshWt.files = [];
          }
          this.fileStates.set(freshWt.id, freshWt.files);
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
          this.fileStates.set(freshWt.id, freshWt.files);
          log.info(`[path] worktree path changed: ${prevWt.path} → ${freshWt.path}`);
        } else {
          // Badge-only change — preserve diffMode, files, and activity
          // timestamp. The upsert below propagates the new badge to the webview.
          freshWt.diffMode = prevWt.diffMode;
          freshWt.files = prevWt.files;
          freshWt.branchFiles = prevWt.branchFiles;
          freshWt.lastActivityAt = prevWt.lastActivityAt;
          this.fileStates.set(freshWt.id, freshWt.files);
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

      // Reconcile per-worktree file watchers surgically: dispose watchers for
      // removed/moved ids and create new ones for added/moved ids. A full
      // setupFileWatcher() tears down every remaining watcher unnecessarily.
      const prevById = new Map(this.worktrees.map((wt) => [wt.id, wt]));
      for (const prevWt of this.worktrees) {
        const freshWt = fresh.find((wt) => wt.id === prevWt.id);
        if (!freshWt || freshWt.path !== prevWt.path) {
          this.disposeFileWatcherForWorktree(prevWt.id);
        }
      }

      this.worktrees = fresh;

      for (const freshWt of fresh) {
        const prevWt = prevById.get(freshWt.id);
        if (!prevWt || prevWt.path !== freshWt.path) {
          this.addFileWatcherForWorktree(freshWt);
        }
      }
    } catch (err) {
      log.error('checkForWorktreeChanges error:', err);
      reportError(err as Error, { context: 'checkForWorktreeChanges' });
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
      reportError(err as Error, {
        context: 'handleSetDiffMode',
        branch: wt.branch,
        mode: diffMode.type,
      });
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
      reportError(err as Error, { context: 'handleFetchBranches' });
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
      reportError(err as Error, { context: 'handleGetBranchList' });
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

    // Only prompt when there are unstaged changes that will be stashed/restored.
    // A clean swap (or one with only staged/committed changes) is safe enough to
    // execute without interrupting the user.
    const hasUnstagedChanges = (wt: WorktreeState) =>
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
          reportError(err as Error, {
            context: 'handleSwapBranches',
            branchA: linkedWt.branch,
            branchB: mainWt.branch,
          });
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
    const branchName = `${wtName}-${Date.now().toString(36)}`;

    // Instant feedback: tell the renderer we've started. The pending flag is
    // cleared automatically when the `worktree-added` event arrives (success)
    // or when we emit `worktree-add-failed` below.
    this.postMessage({ type: 'event', event: { type: 'worktree-add-pending' } });

    try {
      await gitWrite(['worktree', 'add', '-b', branchName, wtPath], {
        cwd: this.currentRoot!,
        timeout: 30_000,
      });
      await this.checkForWorktreeChanges();
    } catch (err) {
      log.error('handleAddWorktree error:', err);
      reportError(err as Error, { context: 'handleAddWorktree' });
      this.postMessage({ type: 'event', event: { type: 'worktree-add-failed' } });
      void vscode.window.showErrorMessage(`Failed to add worktree: ${(err as Error).message}`);
    }
  }

  /**
   * Remove a linked (non-primary) worktree. Confirmation happens inline in
   * the renderer (popover on the trash icon), so this handler assumes the
   * user has already consented.
   */
  async handleRemoveWorktree(worktreeId: string): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;

    if (wt.isMainWorktree) {
      void vscode.window.showErrorMessage('Cannot remove the primary worktree.');
      return;
    }

    // Instant feedback: the card greys out / shows a spinner before the
    // (potentially queued) git command runs.
    this.postMessage({
      type: 'event',
      event: { type: 'worktree-removal-pending', worktreeId: wt.id },
    });

    // Stop watching this worktree before any filesystem mutation so the
    // subsequent rm -rf doesn't emit a flood of stale delete events.
    this.disposeFileWatcherForWorktree(wt.id);

    try {
      await this.fastRemoveWorktree(wt.path, this.currentRoot!);

      // Local bookkeeping: drop this worktree from the cache and broadcast
      // the removal. The worktree-removed event updates the renderer store;
      // the 3s worktree poll is the safety net if anything drifted.
      this.worktrees = this.worktrees.filter((w) => w.id !== wt.id);
      this.fileStates.delete(wt.id);

      this.postMessage({
        type: 'event',
        event: { type: 'worktree-removed', worktreeId: wt.id },
      });
    } catch (err) {
      log.error('handleRemoveWorktree error:', err);
      reportError(err as Error, { context: 'handleRemoveWorktree', branch: wt.branch });
      // The worktree may still be live — re-arm its watcher so file events
      // keep flowing.
      this.addFileWatcherForWorktree(wt);
      this.postMessage({
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
  private async fastRemoveWorktree(worktreePath: string, gitRoot: string): Promise<void> {
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
      const oldId = wt.id;
      await moveWorktree(wt.path, newPath, this.currentRoot!);

      // Update cached worktree identity in-place
      wt.id = newPath;
      wt.path = newPath;

      // Migrate fileStates to the new key
      const prevFiles = this.fileStates.get(oldId);
      if (prevFiles) {
        this.fileStates.delete(oldId);
        this.fileStates.set(wt.id, prevFiles);
      }

      // Send a rename event so the renderer swaps IDs atomically (no exit+enter animation)
      this.postMessage({
        type: 'event',
        event: { type: 'worktree-renamed', oldWorktreeId: oldId, worktree: wt },
      });

      // Refresh the file watcher for the new path (skip full re-detect to avoid
      // the remove+add detection that causes a duplicate animation)
      this.setupFileWatcher();
    } catch (err) {
      log.error('handleRenameWorktree error:', err);
      reportError(err as Error, { context: 'handleRenameWorktree', branch: wt.branch });
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
      reportError(err as Error, { context: 'handleFileClick' });
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
    for (const [, disposables] of this.fileWatchersByWorktree) {
      for (const d of disposables) d.dispose();
    }
    this.fileWatchersByWorktree.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.worktrees = [];
    this.fileStates.clear();
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
  async applyDiffModeOverrides(overrides: Record<string, DiffMode>): Promise<void> {
    if (!overrides || Object.keys(overrides).length === 0) return;
    await Promise.all(
      this.worktrees.map(async (wt) => {
        const override = overrides[wt.branch];
        if (!override) return;
        // Skip if already matching (e.g. feature branch already defaults to "vs main")
        if (isDiffModeEqual(wt.diffMode, override)) return;
        log.info(`[diffMode] applyOverride: ${wt.branch} → ${JSON.stringify(override)}`);
        try {
          // Fetch with the target mode explicitly — do NOT mutate wt.diffMode
          // yet, so concurrent readers still see a consistent snapshot.
          const { files, branchFiles } = await this.getFilesForMode(wt, override);
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
          this.fileStates.set(wt.id, files);
          this.postMessage({
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
