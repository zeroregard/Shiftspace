import * as vscode from 'vscode';
import { ShiftspacePanel } from './ShiftspacePanel';
import { runDetectActionsCommand } from './ActionManager';

export function activate(context: vscode.ExtensionContext) {
  // Restore any Shiftspace tabs that were open before a window reload.
  // Must be registered synchronously at activation time.
  ShiftspacePanel.registerSerializer(context);

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

  context.subscriptions.push(
    vscode.commands.registerCommand('shiftspace.detectActions', () => {
      void runDetectActionsCommand();
    })
  );
}

export function deactivate() {}
