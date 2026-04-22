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
import { loadAllFileChanges, refreshWorktree, reloadAllWithFilter } from './refresh';
import { checkForWorktreeChanges } from './worktree-reconciler';
import { applyDiffModeOverrides } from './diff-mode';
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
  worktrees: WorktreeState[] = [];
  fileStates = new Map<string, FileChange[]>();
  currentRoot: string | undefined;
  defaultBranch = 'main';
  readonly fileEvents: FileEventCoordinator;
  private readonly poller: Poller;

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
    await this.initialize(diffModeOverrides);
  }

  /** Re-run the full initialize flow against the current root. Used after checkout/swap. */
  reinitialize(): Promise<void> {
    return this.initialize();
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

    // Preserve the current "last activity" timestamp across re-initialization
    // (checkout / swap / re-init). detectWorktrees() stamps a fresh Date.now()
    // on every worktree it returns, which would otherwise reset the
    // "last updated" display on every worktree each time we re-init.
    const prevActivity = new Map(this.worktrees.map((wt) => [wt.id, wt.lastActivityAt]));

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

    await loadAllFileChanges(this);

    this.postMessage({ type: 'init', worktrees: this.worktrees });
    this.fileEvents.rebuildFileWatchers();
    this.fileEvents.startAuxWatchers();
    this.poller.start();
  }

  // ── Delegating methods ──────────────────────────────────────────────────

  refreshWorktree(wt: WorktreeState): Promise<void> {
    return refreshWorktree(this, wt);
  }
  checkForWorktreeChanges(): Promise<void> {
    return checkForWorktreeChanges(this);
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
    this.fileEvents.dispose();
    this.worktrees = [];
    this.fileStates.clear();
  }

  dispose(): void {
    this.tearDown();
  }
}
