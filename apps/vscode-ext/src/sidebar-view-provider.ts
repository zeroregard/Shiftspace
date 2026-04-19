import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { SharedGitProvider } from './shared-git-provider';
import { ShiftspacePanel } from './shiftspace-panel';
import { log } from './logger';
import { reportError, reportInvariant, reportUnexpectedState } from './telemetry';
import type { WebviewMessage } from '@shiftspace/renderer';

const VIEW_ID = 'sidebar';

type SortMode = 'last-updated' | 'name' | 'branch';

const SORT_OPTIONS: Array<{ label: string; value: SortMode; description?: string }> = [
  { label: 'Last updated', value: 'last-updated', description: 'Most recently changed first' },
  { label: 'Name (A\u2013Z)', value: 'name', description: 'Worktree directory name' },
  { label: 'Branch (A\u2013Z)', value: 'branch', description: 'Git branch name' },
];

/**
 * Renders a slim grove view (SidebarView) inside the activity-bar sidebar.
 *
 * Uses the shared GitDataProvider (via SharedGitProvider) so that worktree
 * mutations in either view are reflected instantly in both.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _currentSortMode: SortMode = 'name';

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _sharedGit: SharedGitProvider
  ) {}

  registerSortCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('shiftspace.sortWorktrees', async () => {
      const picked = await vscode.window.showQuickPick(
        SORT_OPTIONS.map((opt) => ({
          label: `${opt.value === this._currentSortMode ? '$(check) ' : '      '}${opt.label}`,
          description: opt.description,
          value: opt.value,
        })),
        { placeHolder: 'Sort worktrees by\u2026' }
      );
      if (!picked) return;
      this._currentSortMode = picked.value;
      this._sharedGit.broadcast({ type: 'set-sort-mode', mode: picked.value });
    });
  }

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

    // Listen for messages from the sidebar webview. Payloads are a
    // discriminated union — switching on `message.type` narrows each case to
    // the exact fields it carries, so missing fields are a compile error
    // rather than silent `undefined` drops.
    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        try {
          const provider = this._sharedGit.provider;
          switch (message.type) {
            case 'ready':
              void this.onReady();
              break;
            case 'worktree-click':
              ShiftspacePanel.openInspection(this._context, message.worktreeId);
              break;
            case 'get-branch-list':
              void provider?.handleGetBranchList(message.worktreeId);
              break;
            case 'checkout-branch':
              void provider?.handleCheckoutBranch(message.worktreeId, message.branch);
              break;
            case 'fetch-branches':
              void provider?.handleFetchBranches(message.worktreeId);
              break;
            case 'rename-worktree':
              void provider?.handleRenameWorktree(message.worktreeId, message.newName);
              break;
            case 'add-worktree':
              void provider?.handleAddWorktree();
              break;
            case 'remove-worktree':
              void provider?.handleRemoveWorktree(message.worktreeId);
              break;
            case 'swap-branches':
              void provider?.handleSwapBranches(message.worktreeId);
              break;
            case 'webview-error':
              log.error(`[Webview/Sidebar] ${message.error}`);
              reportUnexpectedState('webview.sidebar.errorReport', {
                preview: message.error.slice(0, 120),
              });
              break;
            default:
              log.warn(`Sidebar: unhandled message type "${message.type}"`);
              reportInvariant('webview.sidebar.unhandledMessageType', {
                messageType: message.type,
              });
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
