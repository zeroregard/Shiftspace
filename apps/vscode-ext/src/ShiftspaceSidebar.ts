import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider, createGitDataProvider } from './GitDataProvider';

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

    let gitProvider: GitDataProvider | undefined;

    webviewView.webview.onDidReceiveMessage(
      (message: { type: string; worktreeId?: string; filePath?: string }) => {
        if (message.type === 'ready') {
          const postMessage = (msg: object) => {
            void webviewView.webview.postMessage(msg);
          };
          gitProvider?.dispose();
          gitProvider = undefined;
          void createGitDataProvider(postMessage).then((p) => {
            gitProvider = p ?? undefined;
          });
        } else if (message.type === 'file-click') {
          void gitProvider?.handleFileClick(message.worktreeId ?? '', message.filePath ?? '');
        }
      }
    );

    webviewView.onDidDispose(() => {
      gitProvider?.dispose();
      gitProvider = undefined;
    });
  }
}
