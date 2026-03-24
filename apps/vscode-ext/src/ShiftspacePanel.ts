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

    // Determine initial repo: active file first, then first workspace folder.
    // resolveGitRoot() expects a file path and uses path.dirname internally.
    // For workspace folders (already directories) we call getGitRoot() directly.
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const fallbackFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    let gitRoot: string | null = null;
    if (activeFile) {
      gitRoot = await this.resolveGitRoot(activeFile);
    }
    if (!gitRoot && fallbackFolder) {
      const cached = this._gitRootCache.get(fallbackFolder);
      gitRoot = cached !== undefined ? cached : await getGitRoot(fallbackFolder);
      if (gitRoot) this._gitRootCache.set(fallbackFolder, gitRoot);
    }

    if (!gitRoot) {
      postMessage({
        type: 'error',
        message:
          activeFile || fallbackFolder ? 'No git repository found' : 'Open a file to get started',
      });
      return;
    }

    this._currentGitRoot = gitRoot;
    await this._gitProvider.switchRepo(gitRoot);
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
