import * as vscode from 'vscode';
import { GitDataProvider } from './GitDataProvider';
import { RepoTracker } from './git/RepoTracker';
import { log } from './logger';

type PostMessage = (msg: object) => void;

/**
 * Shares a single GitDataProvider across the sidebar and tab webviews.
 *
 * Both views register their postMessage callback. All git-state messages are
 * broadcast to every registered view, so a rename/checkout/swap in the sidebar
 * is reflected in the tab instantly (and vice versa).
 *
 * Lifecycle:
 *  1. Created once in `activate()`.
 *  2. Views call `registerView` / `unregisterView` as they come and go.
 *  3. First view to register triggers initialization (git root detection, etc.).
 *  4. Disposed when the extension deactivates.
 */
export class SharedGitProvider implements vscode.Disposable {
  private _provider: GitDataProvider | undefined;
  private _repoTracker = new RepoTracker();
  private _views = new Map<string, PostMessage>();
  private _fileChangeListeners: Array<(worktreeId: string) => void> = [];
  private _repoChangeListeners: Array<(gitRoot: string) => void> = [];
  private _currentRoot: string | undefined;
  private _initialized = false;
  private _initializing: Promise<void> | undefined;

  // ── Broadcast ────────────────────────────────────────────────────────────

  private broadcast = (msg: object): void => {
    for (const post of this._views.values()) {
      post(msg);
    }
  };

  private notifyFileChange = (worktreeId: string): void => {
    for (const fn of this._fileChangeListeners) {
      fn(worktreeId);
    }
  };

  // ── View registration ────────────────────────────────────────────────────

  /**
   * Register a webview to receive git state updates.
   * If the provider is already initialized, sends the current worktree
   * snapshot to the new view immediately so it doesn't start empty.
   */
  registerView(id: string, postMessage: PostMessage): void {
    this._views.set(id, postMessage);
    if (this._provider && this._initialized) {
      const worktrees = this._provider.getFullWorktrees();
      if (worktrees.length > 0) {
        postMessage({ type: 'init', worktrees });
      }
    }
  }

  /** Unregister a webview (e.g. when it's disposed or its webview reloads). */
  unregisterView(id: string): void {
    this._views.delete(id);
  }

  // ── Event subscriptions ──────────────────────────────────────────────────

  /** Subscribe to per-worktree file change events (for actions/icons/insights). */
  addFileChangeListener(listener: (worktreeId: string) => void): () => void {
    this._fileChangeListeners.push(listener);
    return () => {
      this._fileChangeListeners = this._fileChangeListeners.filter((l) => l !== listener);
    };
  }

  /** Subscribe to repo-switch events (e.g. to re-initialize ActionCoordinator). */
  addRepoChangeListener(listener: (gitRoot: string) => void): () => void {
    this._repoChangeListeners.push(listener);
    return () => {
      this._repoChangeListeners = this._repoChangeListeners.filter((l) => l !== listener);
    };
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  /** The underlying GitDataProvider (for calling mutation methods). */
  get provider(): GitDataProvider | undefined {
    return this._provider;
  }

  get currentGitRoot(): string | undefined {
    return this._currentRoot;
  }

  get repoTracker(): RepoTracker {
    return this._repoTracker;
  }

  // ── Initialization ───────────────────────────────────────────────────────

  /**
   * Ensure the shared provider is initialized. Safe to call multiple times —
   * subsequent calls await the first initialization. Returns the detected
   * git root, or undefined if none was found.
   */
  async ensureInitialized(): Promise<string | undefined> {
    if (this._initialized) return this._currentRoot;
    if (this._initializing) {
      await this._initializing;
      return this._currentRoot;
    }

    this._initializing = this.doInitialize();
    await this._initializing;
    this._initializing = undefined;
    return this._currentRoot;
  }

  private async doInitialize(): Promise<void> {
    this._provider = new GitDataProvider(this.broadcast, this.notifyFileChange);

    this._repoTracker.startWatching(async (newRoot) => {
      this._currentRoot = newRoot;
      await this._provider?.switchRepo(newRoot);
      this._initialized = true;
      for (const fn of this._repoChangeListeners) {
        fn(newRoot);
      }
    });

    const gitRoot = await this._repoTracker.detectInitialGitRoot();
    if (!gitRoot) {
      // No git repo found — views will show an error via their own onReady
      return;
    }

    this._currentRoot = gitRoot;
    await this._provider.switchRepo(gitRoot);
    this._initialized = true;

    log.info(`SharedGitProvider: initialized with root ${gitRoot}`);
  }

  // ── Disposal ─────────────────────────────────────────────────────────────

  dispose(): void {
    this._repoTracker.dispose();
    this._provider?.dispose();
    this._provider = undefined;
    this._views.clear();
    this._fileChangeListeners = [];
    this._repoChangeListeners = [];
    this._initialized = false;
    this._initializing = undefined;
  }
}
