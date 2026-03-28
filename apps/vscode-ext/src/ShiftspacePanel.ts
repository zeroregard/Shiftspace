import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider } from './GitDataProvider';
import { ActionManager } from './ActionManager';
import type { ExtensionActionConfig } from './ActionManager';
import { getGitRoot } from './git/worktrees';
import { IconThemeProvider } from './IconThemeProvider';

export class ShiftspacePanel {
  private static currentPanel: ShiftspacePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _gitProvider: GitDataProvider | undefined;
  private _actionManager: ActionManager | undefined;

  private _iconProvider: IconThemeProvider | undefined;

  // Workspace-switching state
  private _gitRootCache = new Map<string, string>(); // dir → gitRoot
  private _currentGitRoot: string | undefined;
  private _repoSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  private _editorChangeDisposable: vscode.Disposable | undefined;
  private _settingsChangeDisposable: vscode.Disposable | undefined;

  static toggle(context: vscode.ExtensionContext) {
    if (ShiftspacePanel.currentPanel) {
      ShiftspacePanel.currentPanel.dispose();
    } else {
      ShiftspacePanel.createOrShow(context);
    }
  }

  static registerSerializer(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer('shiftspace', {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
          panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
          };
          ShiftspacePanel.currentPanel = new ShiftspacePanel(panel, context);
        },
      })
    );
  }

  static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ShiftspacePanel.currentPanel) {
      ShiftspacePanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'shiftspace',
      'Shiftspace',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
      }
    );

    ShiftspacePanel.currentPanel = new ShiftspacePanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._panel.webview.html = getWebviewHtml(this._panel.webview, context.extensionUri);

    this._panel.webview.onDidReceiveMessage(
      (message: {
        type: string;
        worktreeId?: string;
        filePath?: string;
        diffMode?: unknown;
        branch?: string;
        folderPath?: string;
        actionId?: string;
      }) => {
        if (message.type === 'ready') {
          void this.onReady();
        } else if (message.type === 'file-click') {
          void this._gitProvider?.handleFileClick(message.worktreeId ?? '', message.filePath ?? '');
        } else if (message.type === 'set-diff-mode' && message.worktreeId && message.diffMode) {
          void this._gitProvider?.handleSetDiffMode(
            message.worktreeId,
            message.diffMode as import('@shiftspace/renderer').DiffMode
          );
        } else if (message.type === 'get-branch-list' && message.worktreeId) {
          void this._gitProvider?.handleGetBranchList(message.worktreeId);
        } else if (message.type === 'checkout-branch' && message.worktreeId && message.branch) {
          void this._gitProvider?.handleCheckoutBranch(message.worktreeId, message.branch);
        } else if (message.type === 'folder-click' && message.worktreeId && message.folderPath) {
          void this._gitProvider?.handleFolderClick(message.worktreeId, message.folderPath);
        } else if (message.type === 'fetch-branches' && message.worktreeId) {
          void this._gitProvider?.handleFetchBranches(message.worktreeId);
        } else if (message.type === 'run-action' && message.worktreeId && message.actionId) {
          void this._actionManager?.runAction(message.worktreeId, message.actionId);
        } else if (message.type === 'stop-action' && message.worktreeId && message.actionId) {
          this._actionManager?.stopAction(message.worktreeId, message.actionId);
        } else if (message.type === 'swap-branches' && message.worktreeId) {
          void this._gitProvider?.handleSwapBranches(message.worktreeId);
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private async onReady(): Promise<void> {
    const postMessage = (msg: object) => {
      void this._panel.webview.postMessage(msg);
    };

    // Reset providers and state
    this._gitProvider?.dispose();
    this._actionManager?.dispose();
    this._iconProvider?.dispose();
    this._settingsChangeDisposable?.dispose();

    this._gitProvider = new GitDataProvider(postMessage);
    this._actionManager = new ActionManager(postMessage);
    this._iconProvider = new IconThemeProvider();
    this._currentGitRoot = undefined;

    // Load and send initial action configs
    this.reloadActionConfigs();

    // Watch for settings changes (actions + icon theme)
    this._settingsChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('shiftspace.actions')) {
        this.reloadActionConfigs();
      }
      if (e.affectsConfiguration('workbench.iconTheme')) {
        void this.reloadIcons();
      }
    });

    // Re-register editor change listener (guards against multiple ready events)
    this._editorChangeDisposable?.dispose();
    this._editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      this.onActiveEditorChange(editor);
    });

    const gitRoot = await this.detectInitialGitRoot();

    if (!gitRoot) {
      const hasSomething =
        vscode.window.activeTextEditor || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      postMessage({
        type: 'error',
        message: hasSomething ? 'No git repository found' : 'Open a file to get started',
      });
      return;
    }

    this._currentGitRoot = gitRoot;
    await this._gitProvider.switchRepo(gitRoot);

    // Let the ActionManager know about the worktrees (for path/branch lookup)
    this.syncWorktreesToActionManager();

    // Resolve and send file icons (non-blocking — icons are an enhancement)
    void this.reloadIcons();
  }

  /**
   * Load the active icon theme and send the resolved IconMap to the webview.
   * Called once after initial git data loads, and again when the icon theme
   * changes. Failures are swallowed — icons are a non-critical enhancement.
   */
  private async reloadIcons(): Promise<void> {
    if (!this._iconProvider || !this._gitProvider) return;

    const loaded = await this._iconProvider.load();
    console.log('[Shiftspace] reloadIcons: theme loaded =', loaded);
    if (!loaded) return;

    const filePaths = this._gitProvider.getAllFilePaths();
    const iconMap = await this._iconProvider.resolveForFiles(filePaths);
    console.log(
      '[Shiftspace] reloadIcons: filePaths.length =',
      filePaths.length,
      '| iconMap keys =',
      Object.keys(iconMap).length
    );
    void this._panel.webview.postMessage({ type: 'icon-theme', payload: iconMap });
  }

  private reloadActionConfigs(): void {
    const config = vscode.workspace.getConfiguration('shiftspace');
    const rawActions = config.get<ExtensionActionConfig[]>('actions') ?? [];
    this._actionManager?.updateConfigs(rawActions);
    this._actionManager?.sendConfigs();
  }

  private syncWorktreesToActionManager(): void {
    if (!this._gitProvider || !this._actionManager) return;
    const worktrees = this._gitProvider.getWorktrees();
    this._actionManager.updateWorktrees(
      worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }))
    );
  }

  /**
   * Determine the initial git root to show.
   *
   * Priority:
   *  1. VSCode's built-in git extension — already has repos discovered, no subprocess needed.
   *     Prefers the repo containing the active file; falls back to the first discovered repo.
   *  2. Active text editor file path (runs git rev-parse ourselves).
   *  3. Each workspace folder in order (runs git rev-parse ourselves).
   */
  private async detectInitialGitRoot(): Promise<string | null> {
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

    // Tier 1: ask VS Code's built-in git extension — fastest and most reliable
    const fromExtension = this.getGitRootFromVscodeExtension(activeFile);
    if (fromExtension) return fromExtension;

    // Tier 2: run git ourselves against the active file's directory
    if (activeFile) {
      const root = await this.resolveGitRoot(activeFile);
      if (root) return root;
    }

    // Tier 3: run git ourselves against each workspace folder
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const folderPath = folder.uri.fsPath;
      const cached = this._gitRootCache.get(folderPath);
      const root = cached !== undefined ? cached : await getGitRoot(folderPath);
      if (root) {
        this._gitRootCache.set(folderPath, root);
        return root;
      }
    }

    return null;
  }

  /**
   * Ask VS Code's built-in git extension for already-discovered repositories.
   * Returns the root of the repo containing `activeFilePath` if provided,
   * otherwise the first discovered repo root. Returns undefined if the
   * extension is unavailable or has no repos yet.
   */
  private getGitRootFromVscodeExtension(activeFilePath?: string): string | undefined {
    const gitExt = vscode.extensions.getExtension<{
      getAPI(version: 1): { repositories: Array<{ rootUri: vscode.Uri }> };
    }>('vscode.git');

    if (!gitExt?.isActive) return undefined;

    const repos = gitExt.exports.getAPI(1).repositories;
    if (repos.length === 0) return undefined;

    if (activeFilePath) {
      const match = repos.find((r) => activeFilePath.startsWith(r.rootUri.fsPath));
      if (match) return match.rootUri.fsPath;
    }

    return repos[0]!.rootUri.fsPath;
  }

  private onActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    // No editor or untitled file → keep showing the current repo
    const filePath = editor?.document.uri.fsPath;
    if (!filePath) return;

    // Debounce rapid tab switching (e.g. Cmd+Tab through many files)
    if (this._repoSwitchTimer !== undefined) clearTimeout(this._repoSwitchTimer);
    this._repoSwitchTimer = setTimeout(() => {
      this._repoSwitchTimer = undefined;
      void this.maybeSwitch(filePath);
    }, 250);
  }

  private async maybeSwitch(filePath: string): Promise<void> {
    const gitRoot = await this.resolveGitRoot(filePath);
    if (!gitRoot) return; // not in a git repo — keep current view
    if (gitRoot === this._currentGitRoot) return; // same repo — no-op
    this._currentGitRoot = gitRoot;
    await this._gitProvider?.switchRepo(gitRoot);
    this.syncWorktreesToActionManager();
  }

  /** Resolve git root for a file path (not a directory), using a per-directory cache. */
  private async resolveGitRoot(filePath: string): Promise<string | null> {
    const dir = path.dirname(filePath);
    const cached = this._gitRootCache.get(dir);
    if (cached !== undefined) return cached;
    const root = await getGitRoot(dir); // getGitRoot expects a directory
    if (root) this._gitRootCache.set(dir, root);
    return root;
  }

  private dispose() {
    ShiftspacePanel.currentPanel = undefined;

    if (this._repoSwitchTimer !== undefined) {
      clearTimeout(this._repoSwitchTimer);
      this._repoSwitchTimer = undefined;
    }
    this._editorChangeDisposable?.dispose();
    this._editorChangeDisposable = undefined;
    this._settingsChangeDisposable?.dispose();
    this._settingsChangeDisposable = undefined;

    this._gitProvider?.dispose();
    this._gitProvider = undefined;
    this._actionManager?.dispose();
    this._actionManager = undefined;
    this._iconProvider?.dispose();
    this._iconProvider = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
