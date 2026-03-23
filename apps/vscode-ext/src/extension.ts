import * as vscode from 'vscode';
import { ShiftspacePanel } from './ShiftspacePanel';
import { ShiftspaceSidebar } from './ShiftspaceSidebar';

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new ShiftspaceSidebar(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shiftspace.sidebar', sidebarProvider)
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
