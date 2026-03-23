import * as vscode from 'vscode';
import * as path from 'path';
import type { WorktreeState, ShiftspaceEvent } from '@shiftspace/renderer';
import { detectWorktrees, checkGitAvailability } from './git/worktrees';
import { getFileChanges } from './git/status';
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
 *  1. Call `initialize()` once — detects workspace, queries git, sends `init`.
 *  2. Filesystem watcher emits surgical `event` messages as files change.
 *  3. Call `dispose()` when the view is closed.
 */
export class GitDataProvider implements vscode.Disposable {
  private worktrees: WorktreeState[] = [];
  private fileStates = new Map<string, WorktreeState['files']>(); // worktreeId → files
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private worktreePollingTimer: ReturnType<typeof setInterval> | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly repoRoot: string,
    private readonly postMessage: PostMessage
  ) {}

  /** Detect workspace, load git data, set up watcher, send init message. */
  async initialize(): Promise<void> {
    const gitStatus = await checkGitAvailability(this.repoRoot);
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

    this.worktrees = await detectWorktrees(this.repoRoot);
    await this.loadAllFileChanges();

    this.postMessage({ type: 'init', worktrees: this.worktrees });
    this.setupFileWatcher();
    this.startWorktreePolling();
  }

  private async loadAllFileChanges(): Promise<void> {
    await Promise.allSettled(
      this.worktrees.map(async (wt) => {
        try {
          const files = await getFileChanges(wt.path);
          wt.files = files;
          this.fileStates.set(wt.id, files);
        } catch {
          // leave files as []
        }
      })
    );
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
      }, 500)
    );
  }

  private async refreshWorktree(wt: WorktreeState): Promise<void> {
    try {
      const newFiles = await getFileChanges(wt.path);
      const prevFiles = this.fileStates.get(wt.id) ?? [];
      const events = diffFileChanges(wt.id, prevFiles, newFiles);

      wt.files = newFiles;
      this.fileStates.set(wt.id, newFiles);

      for (const event of events) {
        this.postMessage({ type: 'event', event });
      }
    } catch {
      // silently ignore per-worktree errors
    }
  }

  private startWorktreePolling(): void {
    this.worktreePollingTimer = setInterval(() => {
      void this.checkForWorktreeChanges();
    }, 15_000);
  }

  private async checkForWorktreeChanges(): Promise<void> {
    try {
      const fresh = await detectWorktrees(this.repoRoot);
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
          try {
            wt.files = await getFileChanges(wt.path);
          } catch {
            // leave empty
          }
          const event: ShiftspaceEvent = { type: 'worktree-added', worktree: wt };
          this.postMessage({ type: 'event', event });
        }
      }

      this.worktrees = fresh;
    } catch {
      // ignore polling errors
    }
  }

  /** Open the clicked file in the editor. */
  async handleFileClick(worktreeId: string, filePath: string): Promise<void> {
    const wt = this.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;
    const absolutePath = path.join(wt.path, filePath);
    const fileUri = vscode.Uri.file(absolutePath);
    try {
      await vscode.commands.executeCommand('vscode.open', fileUri);
    } catch {
      // ignore
    }
  }

  dispose(): void {
    if (this.worktreePollingTimer !== undefined) {
      clearInterval(this.worktreePollingTimer);
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

/** Factory: create a GitDataProvider when a workspace is open, otherwise send error. */
export async function createGitDataProvider(
  postMessage: PostMessage
): Promise<GitDataProvider | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    postMessage({ type: 'error', message: 'Open a folder to get started' });
    return undefined;
  }

  const repoRoot = folders[0]!.uri.fsPath;
  const provider = new GitDataProvider(repoRoot, postMessage);
  await provider.initialize();
  return provider;
}
