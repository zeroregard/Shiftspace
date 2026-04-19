import * as vscode from 'vscode';
import * as path from 'path';
import type { WorktreeState } from '@shiftspace/renderer';
import { WORKTREE_CONFIG_FILENAME } from '../git/worktrees';
import { gitQueue } from '../git/git-utils';
import { isIgnoredPath, findWorktreeForPath } from './helpers';

export interface FileEventCallbacks {
  onRefresh: (wt: WorktreeState) => void;
  onWorktreesChanged: () => void;
  onConfigChanged: () => void;
  getCurrentRoot: () => string | undefined;
  getWorktrees: () => WorktreeState[];
}

// 1 second gives the user time to finish their git operation before we
// issue our own read-only queries.
const DEBOUNCE_MS = 1000;

/**
 * Owns every VSCode FileSystemWatcher used by `GitDataProvider`:
 *
 *  - Per-worktree `**\/*` watchers (content changes → debounced refresh)
 *  - `.git/HEAD` + `.git/worktrees/*\/HEAD` (branch checkout detection)
 *  - `.git/index` + `.git/worktrees/*\/index` (staging/unstaging detection)
 *  - Workspace `.shiftspace-worktree.json` (agent-written badge propagation)
 *  - `shiftspace.ignorePatterns` configuration changes
 *
 * The coordinator pushes debounced refresh invitations back to the host via
 * the `onRefresh` / `onWorktreesChanged` / `onConfigChanged` callbacks.
 */
export class FileEventCoordinator implements vscode.Disposable {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private fileWatchersByWorktree = new Map<string, vscode.Disposable[]>();
  private auxDisposables: vscode.Disposable[] = [];

  constructor(private readonly cb: FileEventCallbacks) {}

  /** Install HEAD/index/config/badge watchers. Called once per repo initialization. */
  startAuxWatchers(): void {
    this.setupHeadWatcher();
    this.setupIndexWatcher();
    this.setupConfigWatcher();
    this.setupWorktreeBadgeWatcher();
  }

  /** Rebuild the full set of per-worktree content watchers from the host's current list. */
  rebuildFileWatchers(): void {
    for (const [, disposables] of this.fileWatchersByWorktree) {
      for (const d of disposables) d.dispose();
    }
    this.fileWatchersByWorktree.clear();
    for (const wt of this.cb.getWorktrees()) this.addWorktree(wt);
  }

  /**
   * Create a per-worktree file watcher using RelativePattern instead of a
   * single workspace-wide glob.
   *
   * This mitigates the sporadic macOS "Events were dropped by the FSEvents
   * client" error by reducing FSEvents pressure and covering linked
   * worktrees outside the workspace folder (the old glob missed those).
   */
  addWorktree(wt: WorktreeState): void {
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

  /** Dispose a single worktree's watcher. Safe to call for unknown ids. */
  removeWorktree(worktreeId: string): void {
    const disposables = this.fileWatchersByWorktree.get(worktreeId);
    if (!disposables) return;
    for (const d of disposables) d.dispose();
    this.fileWatchersByWorktree.delete(worktreeId);
  }

  /** Schedule a debounced refresh for a specific worktree. */
  scheduleRefresh(wt: WorktreeState): void {
    const existing = this.debounceTimers.get(wt.id);
    if (existing !== undefined) clearTimeout(existing);
    this.debounceTimers.set(
      wt.id,
      setTimeout(() => {
        this.debounceTimers.delete(wt.id);
        // If a write operation is in flight, reschedule instead of dropping.
        // The write will trigger another FS event when it completes, but
        // FSEvents may drop that event, so we must guarantee the refresh
        // eventually runs.
        if (gitQueue.isActive()) {
          this.scheduleRefresh(wt);
          return;
        }
        this.cb.onRefresh(wt);
      }, DEBOUNCE_MS)
    );
  }

  private onFileSystemChange(uri: vscode.Uri): void {
    if (isIgnoredPath(uri.fsPath)) return;
    const wt = findWorktreeForPath(this.cb.getWorktrees(), uri.fsPath);
    if (!wt) return;
    this.scheduleRefresh(wt);
  }

  private setupHeadWatcher(): void {
    const root = this.cb.getCurrentRoot();
    if (!root) return;
    const gitDir = path.join(root, '.git');
    const onHeadChange = () => this.cb.onWorktreesChanged();
    const mainHead = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'HEAD')
    );
    const linkedHeads = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'worktrees/*/HEAD')
    );
    this.auxDisposables.push(
      mainHead,
      mainHead.onDidChange(onHeadChange),
      linkedHeads,
      linkedHeads.onDidChange(onHeadChange)
    );
  }

  private setupIndexWatcher(): void {
    const root = this.cb.getCurrentRoot();
    if (!root) return;
    const gitDir = path.join(root, '.git');
    const onIndexChange = () => {
      for (const wt of this.cb.getWorktrees()) this.scheduleRefresh(wt);
    };
    const mainIndex = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'index')
    );
    const linkedIndexes = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, 'worktrees/*/index')
    );
    this.auxDisposables.push(
      mainIndex,
      mainIndex.onDidChange(onIndexChange),
      linkedIndexes,
      linkedIndexes.onDidChange(onIndexChange)
    );
  }

  private setupConfigWatcher(): void {
    this.auxDisposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('shiftspace.ignorePatterns')) {
          this.cb.onConfigChanged();
        }
      })
    );
  }

  private setupWorktreeBadgeWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${WORKTREE_CONFIG_FILENAME}`);
    const onBadgeChange = () => this.cb.onWorktreesChanged();
    this.auxDisposables.push(
      watcher,
      watcher.onDidChange(onBadgeChange),
      watcher.onDidCreate(onBadgeChange),
      watcher.onDidDelete(onBadgeChange)
    );
  }

  dispose(): void {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    for (const [, disposables] of this.fileWatchersByWorktree) {
      for (const d of disposables) d.dispose();
    }
    this.fileWatchersByWorktree.clear();
    for (const d of this.auxDisposables) d.dispose();
    this.auxDisposables = [];
  }
}
