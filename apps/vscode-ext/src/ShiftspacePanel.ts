import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider } from './GitDataProvider';
import { getGitRoot } from './git/worktrees';

export class ShiftspacePanel {
  private static currentPanel: ShiftspacePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _gitProvider: GitDataProvider | undefined;

  // Workspace-switching state
  private _gitRootCache = new Map<string, string>(); // dir → gitRoot
  private _currentGitRoot: string | undefined;
  private _repoSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  private _editorChangeDisposable: vscode.Disposable | undefined;

  static toggle(context: vscode.ExtensionContext) {
    if (ShiftspacePanel.currentPanel) {
      ShiftspacePanel.currentPanel.dispose();
    } else {
      ShiftspacePanel.createOrShow(context);
    }
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
      (message: { type: string; worktreeId?: string; filePath?: string }) => {
        if (message.type === 'ready') {
          void this.onReady();
        } else if (message.type === 'file-click') {
          void this._gitProvider?.handleFileClick(message.worktreeId ?? '', message.filePath ?? '');
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

    // Reset provider and repo state
    this._gitProvider?.dispose();
    this._gitProvider = new GitDataProvider(postMessage);
    this._currentGitRoot = undefined;

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

    this._gitProvider?.dispose();
    this._gitProvider = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
