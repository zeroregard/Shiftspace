import * as vscode from 'vscode';
import { ShiftspacePanel } from './ShiftspacePanel';

export function activate(context: vscode.ExtensionContext) {
  // Activity bar icon: clicking it opens Shiftspace as an editor tab
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shiftspace.sidebar', {
      resolveWebviewView(webviewView) {
        ShiftspacePanel.createOrShow(context);
        webviewView.webview.html =
          '<html><body style="color:var(--vscode-foreground);padding:16px;font-family:var(--vscode-font-family)">Opening Shiftspace in a tab…</body></html>';
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('shiftspace.toggle', () => {
      ShiftspacePanel.toggle(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('shiftspace.openTab', () => {
      ShiftspacePanel.createOrShow(context);
    })
  );
}

export function deactivate() {}
