import * as vscode from 'vscode';
import type { WorktreeState, DiffMode, FileChange } from '@shiftspace/renderer';
import { log } from '../logger';
import {
  detectWorktrees,
  checkGitAvailability,
  getDefaultBranch,
  recoverStuckTempBranch,
} from '../git/worktrees';
import { FileEventCoordinator } from './file-event-coordinator';
import { Poller } from './poller';
import { PrStatusPoller, prStatusEqual } from './pr-status-poller';
import { loadAllFileChanges, refreshWorktree, reloadAllWithFilter } from './refresh';
import { checkForWorktreeChanges } from './worktree-reconciler';
import { applyDiffModeOverrides } from './diff-mode';
import { refreshAllDefaultBranchStats } from './default-branch-stats';
import {
  handleSetDiffMode,
  handleFetchBranches,
  handleGetBranchList,
  handleCheckoutBranch,
  handleSwapBranches,
} from './mutations-branch';
import {
  handleAddWorktree,
  handleRemoveWorktree,
  handleRenameWorktree,
  handleFolderClick,
  handleFileClick,
  handleLoadPlanContent,
} from './mutations-lifecycle';

type PostMessage = (msg: object) => void;
type OnFileChange = (worktreeId: string) => void;

/**
 * Orchestrates real-git-data gathering for the Shiftspace webview.
 *
 * Lifecycle:
 *  1. Call `switchRepo(gitRoot)` to start tracking a repo (or switch to another).
 *  2. Filesystem watcher emits surgical `event` messages as files change.
 *  3. Call `dispose()` when the view is closed.
 *
 * The class owns the mutable worktree state (`worktrees`, `fileStates`,
 * `currentRoot`, `defaultBranch`) and delegates cohesive subsystems to
 * sibling modules: `FileEventCoordinator` for watchers, `Poller` for
 * interval fallbacks, and free functions for refresh/reconcile/mutation
 * flows. Fields are public so the sibling modules can operate on them
 * directly — external callers should only use the typed methods below.
 */
export class GitDataProvider implements vscode.Disposable {
  fileStates = new Map<string, FileChange[]>();
  currentRoot: string | undefined;
  defaultBranch = 'main';
  readonly fileEvents: FileEventCoordinator;
  private _worktrees: WorktreeState[] = [];
  private _worktreeRevision = 0;
  private reconcilePass: Promise<void> | undefined;
  private reconcileAgain = false;
  private readonly poller: Poller;
  private readonly prPoller: PrStatusPoller;
  private readonly configSubscription: vscode.Disposable;
  /** Worktree ids already auto-deleted (or attempted) after their PR merged. */
  private readonly autoDeleted = new Set<string>();
  /**
   * Per-branch diff-mode selections, kept on the provider so a re-init
   * (checkout, branch swap, poller-driven refresh) restores what the user
   * picked instead of snapping every worktree back to the initial mode.
   * Seeded from persisted view settings and updated on every selection.
   */
  diffModeOverrides: Record<string, DiffMode> = {};

  /**
   * The tracked worktrees. Replacing the list bumps `worktreeRevision`; after
   * editing a worktree's identity in place (a rename), call
   * `markWorktreesMutated()` so the bump still happens.
   */
  get worktrees(): WorktreeState[] {
    return this._worktrees;
  }
  set worktrees(next: WorktreeState[]) {
    this._worktrees = next;
    this._worktreeRevision++;
  }

  /**
   * Monotonic counter of membership/identity changes to `worktrees`. The
   * reconciler captures it before reading `git worktree list` and refuses to
   * apply a snapshot taken before a change it didn't see — without that, a
   * detection racing a deletion re-adds the worktree that was just removed.
   */
  get worktreeRevision(): number {
    return this._worktreeRevision;
  }

  /** Record that a worktree's identity changed in place (rename/move). */
  markWorktreesMutated(): void {
    this._worktreeRevision++;
  }

  constructor(
    public readonly postMessage: PostMessage,
    public readonly onFileChange?: OnFileChange
  ) {
    this.fileEvents = new FileEventCoordinator({
      getCurrentRoot: () => this.currentRoot,
      getWorktrees: () => this.worktrees,
      onRefresh: (wt) => void this.refreshWorktree(wt),
      onWorktreesChanged: () => void this.checkForWorktreeChanges(),
      onConfigChanged: () => void reloadAllWithFilter(this),
    });
    this.poller = new Poller({
      getWorktrees: () => this.worktrees,
      onWorktreePoll: () => this.checkForWorktreeChanges(),
      onStatusPoll: (wt) => this.refreshWorktree(wt),
    });
    this.configSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('shiftspace.worktreeDiffCount') ||
        e.affectsConfiguration('shiftspace.ignorePatterns')
      ) {
        void refreshAllDefaultBranchStats(this);
      }
    });
    this.prPoller = new PrStatusPoller({
      getWorktrees: () => this.worktrees,
      onPrStatus: (worktreeId, prStatus) => {
        const wt = this.worktrees.find((w) => w.id === worktreeId);
        if (!wt) return;
        if (!prStatusEqual(wt.prStatus, prStatus)) {
          wt.prStatus = prStatus;
          this.postMessage({
            type: 'event',
            event: { type: 'pr-status-updated', worktreeId, prStatus },
          });
        }
        // Checked on every poll, not just on change, so turning the setting on
        // also cleans up worktrees whose PR merged earlier in the session.
        if (prStatus?.state === 'merged') this.autoDeleteMergedWorktree(wt);
      },
    });
  }

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
    this.tearDown();
    this.currentRoot = gitRoot;
    // A different repo has its own branches — drop the previous repo's
    // selections rather than merging them in by branch name.
    this.diffModeOverrides = { ...diffModeOverrides };
    await this.initialize(this.diffModeOverrides);
  }

  /** Re-run the full initialize flow against the current root. Used after checkout/swap. */
  reinitialize(): Promise<void> {
    return this.initialize(this.diffModeOverrides);
  }

  private async initialize(diffModeOverrides: Record<string, DiffMode> = {}): Promise<void> {
    if (!this.currentRoot) return;
    this.diffModeOverrides = { ...this.diffModeOverrides, ...diffModeOverrides };

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

    // Preserve the current "last activity" timestamp across re-initialization
    // (checkout / swap / re-init). detectWorktrees() stamps a fresh Date.now()
    // on every worktree it returns, which would otherwise reset the
    // "last updated" display on every worktree each time we re-init.
    const prevActivity = new Map(this.worktrees.map((wt) => [wt.id, wt.lastActivityAt]));
    const prevPrStatus = new Map(
      this.worktrees.filter((wt) => wt.prStatus).map((wt) => [wt.id, wt.prStatus])
    );

    this.worktrees = await detectWorktrees(this.currentRoot);

    // Recover any worktrees left on a temp swap branch from a previous crash
    const recoveryResults = await Promise.all(
      this.worktrees.map((wt) => recoverStuckTempBranch(wt.path))
    );
    if (recoveryResults.some(Boolean)) {
      this.worktrees = await detectWorktrees(this.currentRoot);
    }

    for (const wt of this.worktrees) {
      const prev = prevActivity.get(wt.id);
      if (prev !== undefined) wt.lastActivityAt = prev;
      const prevPr = prevPrStatus.get(wt.id);
      if (prevPr !== undefined) wt.prStatus = prevPr;
    }

    // Every worktree starts on working changes; per-branch selections (both
    // persisted and made earlier this session) win so the first file fetch
    // matches the selector the user will see on open.
    for (const wt of this.worktrees) {
      wt.defaultBranch = this.defaultBranch;
      const override = this.diffModeOverrides[wt.branch];
      if (override) {
        wt.diffMode = override;
        log.info(`[diffMode] init override: ${wt.branch} → ${JSON.stringify(override)}`);
      } else {
        wt.diffMode = { type: 'working' };
        log.info(`[diffMode] init: ${wt.branch} → ${JSON.stringify(wt.diffMode)}`);
      }
    }

    await loadAllFileChanges(this);
    // Before `init` so cards open on the counts the user asked for instead of
    // flashing working-tree numbers first. No-ops unless the setting is on.
    await refreshAllDefaultBranchStats(this);

    this.postMessage({ type: 'init', worktrees: this.worktrees });
    this.fileEvents.rebuildFileWatchers();
    this.fileEvents.startAuxWatchers();
    this.poller.start();
    this.prPoller.start();
  }

  /**
   * Remove a worktree whose PR just landed, when the user has opted in via
   * `shiftspace.pr.autoDeleteMergedWorktrees` (off by default — deleting a
   * directory behind the user's back is only acceptable if they asked for it).
   *
   * The primary worktree is never touched: it's the repo itself, and it often
   * sits on the default branch the PR merged into.
   *
   * Each worktree is attempted at most once per session — including after a
   * failure, so a worktree we can't remove (dirty state, permissions) doesn't
   * re-prompt on every poll.
   */
  private autoDeleteMergedWorktree(wt: WorktreeState): void {
    if (wt.isMainWorktree || this.autoDeleted.has(wt.id)) return;
    const enabled = vscode.workspace
      .getConfiguration('shiftspace')
      .get<boolean>('pr.autoDeleteMergedWorktrees', false);
    if (!enabled) return;
    this.autoDeleted.add(wt.id);
    log.info(`[pr-status] auto-deleting merged worktree ${wt.branch} (${wt.path})`);
    void vscode.window.showInformationMessage(
      `Pull request for "${wt.branch}" was merged — removing its worktree.`
    );
    void this.handleRemoveWorktree(wt.id);
  }

  // ── Delegating methods ──────────────────────────────────────────────────

  refreshWorktree(wt: WorktreeState): Promise<void> {
    return refreshWorktree(this, wt);
  }
  /**
   * Re-detect worktrees and reconcile them against the cached list.
   *
   * Passes never overlap. The HEAD watcher, the badge watcher, the 3s poll and
   * the add-worktree flow all call this, and two passes running at once used
   * to clobber each other's results — the slower one would write its older
   * snapshot over the newer state. A caller arriving mid-pass instead marks
   * the pass to run again and joins its promise, so the promise it gets back
   * always resolves after a detection that started after it asked.
   */
  checkForWorktreeChanges(): Promise<void> {
    if (this.reconcilePass) {
      this.reconcileAgain = true;
      return this.reconcilePass;
    }
    this.reconcilePass = (async () => {
      try {
        do {
          this.reconcileAgain = false;
          await checkForWorktreeChanges(this);
        } while (this.reconcileAgain);
      } finally {
        this.reconcilePass = undefined;
        this.reconcileAgain = false;
      }
    })();
    return this.reconcilePass;
  }
  applyDiffModeOverrides(overrides: Record<string, DiffMode>): Promise<void> {
    return applyDiffModeOverrides(this, overrides);
  }

  handleSetDiffMode(worktreeId: string, diffMode: DiffMode): Promise<void> {
    return handleSetDiffMode(this, worktreeId, diffMode);
  }
  handleFetchBranches(worktreeId: string): Promise<void> {
    return handleFetchBranches(this, worktreeId);
  }
  handleGetBranchList(worktreeId: string): Promise<void> {
    return handleGetBranchList(this, worktreeId);
  }
  handleCheckoutBranch(worktreeId: string, branch: string): Promise<void> {
    return handleCheckoutBranch(this, worktreeId, branch);
  }
  handleSwapBranches(worktreeId: string): Promise<void> {
    return handleSwapBranches(this, worktreeId);
  }

  handleAddWorktree(): Promise<void> {
    return handleAddWorktree(this);
  }
  handleRemoveWorktree(worktreeId: string): Promise<void> {
    return handleRemoveWorktree(this, worktreeId);
  }
  handleRenameWorktree(worktreeId: string, newName: string): Promise<void> {
    return handleRenameWorktree(this, worktreeId, newName);
  }
  handleFolderClick(worktreeId: string, folderPath: string): Promise<void> {
    return handleFolderClick(this, worktreeId, folderPath);
  }
  handleFileClick(worktreeId: string, filePath: string, line?: number): Promise<void> {
    return handleFileClick(this, worktreeId, filePath, line);
  }
  handleLoadPlanContent(worktreeId: string): Promise<void> {
    return handleLoadPlanContent(this, worktreeId);
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  /** Returns current worktree snapshot (id, path, branch) for ActionManager consumption. */
  getWorktrees(): Array<{ id: string; path: string; branch: string }> {
    return this.worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }));
  }

  /** Returns the full WorktreeState array (used to initialize late-joining views). */
  getFullWorktrees(): WorktreeState[] {
    return this.worktrees;
  }

  /** Returns the current FileChange list for a worktree (both files and branchFiles merged). */
  getWorktreeFiles(worktreeId: string): FileChange[] {
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

  // ── Disposal ────────────────────────────────────────────────────────────

  private tearDown(): void {
    this.poller.dispose();
    // Stop (not dispose) so the PR poller's config/auth subscriptions survive a
    // repo switch; a following initialize() restarts its timer.
    this.prPoller.stop();
    this.fileEvents.dispose();
    this.worktrees = [];
    this.fileStates.clear();
    this.autoDeleted.clear();
  }

  dispose(): void {
    this.tearDown();
    this.prPoller.dispose();
    this.configSubscription.dispose();
  }
}
