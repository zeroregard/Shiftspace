import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider } from './GitDataProvider';
import { RepoTracker } from './git/RepoTracker';
import { ShiftspacePanel } from './ShiftspacePanel';

/**
 * Renders a slim grove view (SidebarView) inside the activity-bar sidebar.
 *
 * The sidebar has its own GitDataProvider so it can show worktree cards even
 * when the main editor tab is closed. Clicking a worktree card opens the
 * full Shiftspace tab focused on that worktree.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;
  private _gitProvider: GitDataProvider | undefined;
  private _repoTracker: RepoTracker | undefined;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _webviewContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview')],
    };

    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this._context.extensionUri,
      'sidebar'
    );

    // Listen for messages from the sidebar webview
    webviewView.webview.onDidReceiveMessage(
      (message: { type: string; worktreeId?: string }) => {
        switch (message.type) {
          case 'ready':
            void this.onReady();
            break;
          case 'worktree-click':
            if (message.worktreeId) {
              ShiftspacePanel.createOrShow(this._context);
            }
            break;
        }
      },
      null,
      this._disposables
    );

    webviewView.onDidDispose(() => this.tearDown(), null, this._disposables);
  }

  private async onReady(): Promise<void> {
    // Dispose previous providers if re-initializing
    this._gitProvider?.dispose();
    this._repoTracker?.dispose();

    const postMessage = (msg: object) => {
      void this._view?.webview.postMessage(msg);
    };

    this._repoTracker = new RepoTracker();
    this._gitProvider = new GitDataProvider(postMessage);

    this._repoTracker.startWatching(async (newRoot) => {
      await this._gitProvider?.switchRepo(newRoot);
    });

    const gitRoot = await this._repoTracker.detectInitialGitRoot();
    if (!gitRoot) {
      postMessage({ type: 'error', message: 'No git repository found' });
      return;
    }

    await this._gitProvider.switchRepo(gitRoot);
  }

  private tearDown(): void {
    this._gitProvider?.dispose();
    this._gitProvider = undefined;
    this._repoTracker?.dispose();
    this._repoTracker = undefined;
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
    this._view = undefined;
  }
}
