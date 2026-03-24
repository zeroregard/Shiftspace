import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider, createGitDataProvider } from './GitDataProvider';

export class ShiftspacePanel {
  private static currentPanel: ShiftspacePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _gitProvider: GitDataProvider | undefined;

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
    this._gitProvider?.dispose();
    this._gitProvider = undefined;
    this._gitProvider = (await createGitDataProvider(postMessage)) ?? undefined;
  }

  private dispose() {
    ShiftspacePanel.currentPanel = undefined;
    this._gitProvider?.dispose();
    this._gitProvider = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
