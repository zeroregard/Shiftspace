import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { INITIAL_WORKTREES, startMockUpdates } from './mockData';

export class ShiftspaceSidebar implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.context.extensionUri);

    const stopMock = startMockUpdates((event) => {
      void webviewView.webview.postMessage({ type: 'event', event });
    });

    webviewView.webview.onDidReceiveMessage(
      (message: { type: string; worktreeId?: string; filePath?: string }) => {
        if (message.type === 'ready') {
          void webviewView.webview.postMessage({
            type: 'init',
            worktrees: INITIAL_WORKTREES,
          });
        } else if (message.type === 'file-click') {
          console.log('[Shiftspace] File clicked:', message.worktreeId, message.filePath);
        }
      }
    );

    webviewView.onDidDispose(() => stopMock());
  }
}
