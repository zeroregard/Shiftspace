import * as vscode from 'vscode';
import { ShiftspacePanel } from './ShiftspacePanel';
import { ShiftspaceSidebar } from './ShiftspaceSidebar';

export function activate(context: vscode.ExtensionContext) {
  console.log('[Shiftspace] activate() called');

  const sidebarProvider = new ShiftspaceSidebar(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shiftspace.sidebar', sidebarProvider)
  );
  console.log('[Shiftspace] sidebar provider registered');

  context.subscriptions.push(
    vscode.commands.registerCommand('shiftspace.toggle', () => {
      console.log('[Shiftspace] command: shiftspace.toggle');
      ShiftspacePanel.toggle(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('shiftspace.openTab', () => {
      console.log('[Shiftspace] command: shiftspace.openTab');
      ShiftspacePanel.createOrShow(context);
    })
  );

  console.log('[Shiftspace] activate() done');
}

export function deactivate() {
  console.log('[Shiftspace] deactivate() called');
}
