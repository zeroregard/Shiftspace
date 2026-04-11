import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { SharedGitProvider } from './shared-git-provider';
import { ShiftspacePanel } from './shiftspace-panel';
import { log } from './logger';
import { reportError } from './telemetry';

const VIEW_ID = 'sidebar';

/**
 * Renders a slim grove view (SidebarView) inside the activity-bar sidebar.
 *
 * Uses the shared GitDataProvider (via SharedGitProvider) so that worktree
 * mutations in either view are reflected instantly in both.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _sharedGit: SharedGitProvider
  ) {}

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
          const provider = this._sharedGit.provider;
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
              if (message.worktreeId) void provider?.handleGetBranchList(message.worktreeId);
              break;
            case 'checkout-branch':
              if (message.worktreeId && message.branch)
                void provider?.handleCheckoutBranch(message.worktreeId, message.branch);
              break;
            case 'fetch-branches':
              if (message.worktreeId) void provider?.handleFetchBranches(message.worktreeId);
              break;
            case 'rename-worktree':
              if (message.worktreeId && message.newName)
                void provider?.handleRenameWorktree(message.worktreeId, message.newName);
              break;
            case 'add-worktree':
              void provider?.handleAddWorktree();
              break;
            case 'remove-worktree':
              if (message.worktreeId) void provider?.handleRemoveWorktree(message.worktreeId);
              break;
            case 'swap-branches':
              if (message.worktreeId) void provider?.handleSwapBranches(message.worktreeId);
              break;
            default:
              log.warn(`Sidebar: unhandled message type "${message.type}"`);
              break;
          }
        } catch (err) {
          log.error(`Sidebar: error handling message "${message.type}"`, err);
          reportError(err as Error, { context: 'webviewMessage', messageType: message.type });
        }
      },
      null,
      this._disposables
    );

    webviewView.onDidDispose(() => this.tearDown(), null, this._disposables);
  }

  private async onReady(): Promise<void> {
    const postMessage = (msg: object) => {
      void this._view?.webview.postMessage(msg);
    };

    // Re-register on every "ready" (the webview reference may have changed)
    this._sharedGit.registerView(VIEW_ID, postMessage);

    // Ensure the shared git provider is initialized (no-ops if already done)
    const gitRoot = await this._sharedGit.ensureInitialized();
    if (!gitRoot) {
      postMessage({ type: 'error', message: 'No git repository found' });
    }
  }

  private tearDown(): void {
    this._sharedGit.unregisterView(VIEW_ID);
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
    this._view = undefined;
  }
}
