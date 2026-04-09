import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider } from './git-data-provider';
import { RepoTracker } from './git/repo-tracker';
import { ShiftspacePanel } from './shiftspace-panel';
import { log } from './logger';

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
      (message: { type: string; worktreeId?: string; branch?: string; newName?: string }) => {
        try {
          switch (message.type) {
            case 'ready':
              void this.onReady();
              break;
            case 'worktree-click':
              if (message.worktreeId) {
                ShiftspacePanel.openInspection(this._context, message.worktreeId);
              }
              break;
            case 'get-branch-list':
              if (message.worktreeId)
                void this._gitProvider?.handleGetBranchList(message.worktreeId);
              break;
            case 'checkout-branch':
              if (message.worktreeId && message.branch)
                void this._gitProvider?.handleCheckoutBranch(message.worktreeId, message.branch);
              break;
            case 'fetch-branches':
              if (message.worktreeId)
                void this._gitProvider?.handleFetchBranches(message.worktreeId);
              break;
            case 'rename-worktree':
              if (message.worktreeId && message.newName)
                void this._gitProvider?.handleRenameWorktree(message.worktreeId, message.newName);
              break;
            case 'remove-worktree':
              if (message.worktreeId)
                void this._gitProvider?.handleRemoveWorktree(message.worktreeId);
              break;
            case 'swap-branches':
              if (message.worktreeId)
                void this._gitProvider?.handleSwapBranches(message.worktreeId);
              break;
            default:
              log.warn(`Sidebar: unhandled message type "${message.type}"`);
              break;
          }
        } catch (err) {
          log.error(`Sidebar: error handling message "${message.type}"`, err);
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

    this._disposables.push(
      this._repoTracker.watchSettings(async (newRoot) => {
        await this._gitProvider?.switchRepo(newRoot);
      })
    );

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
