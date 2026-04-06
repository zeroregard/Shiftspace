import * as vscode from 'vscode';
import { CursorShiftspacePanel } from './CursorShiftspacePanel';
import { setupCursorIntegration } from './cursorIntegration';
import { setLogger } from '@shiftspace/core';

export function activate(context: vscode.ExtensionContext) {
  // Initialize core logger with VSCode output channel
  const channel = vscode.window.createOutputChannel('Shiftspace (Cursor)', { log: true });
  context.subscriptions.push(channel);
  setLogger({
    info: (msg, ...args) => channel.info(msg, ...args),
    warn: (msg, ...args) => channel.warn(msg, ...args),
    error: (msg, ...args) => channel.error(msg, ...args),
    debug: (msg, ...args) => channel.debug(msg, ...args),
  });

  // ////// TODO: CURSOR WORKTREE DETECTION
  // Cursor 3 manages worktrees via its Agents Window.
  // We need to figure out how to detect WHICH worktree the user
  // is currently focused on. Options to investigate:
  // 1. vscode.workspace.workspaceFolders — gives us the worktree root
  //    (each Cursor worktree opens in a separate window)
  // 2. Cursor-specific API — no cursor.* namespace exists as of April 2026
  // 3. Active file's git root — same approach as the VSCode extension
  // 4. Environment variables: CURSOR_AGENT=1, ROOT_WORKTREE_PATH
  // For now, fall back to detecting git root from workspace folder.
  // //////

  // Register the Inspect command — opens the Inspection panel directly (no Grove)
  context.subscriptions.push(
    vscode.commands.registerCommand('shiftspace.openInspection', () => {
      CursorShiftspacePanel.createOrShow(context);
    })
  );

  // ////// TODO: CURSOR AGENTS WINDOW INTEGRATION
  // Can we add a button/action to Cursor's Agents Window per-worktree?
  // As of April 2026, the Agents Window is a built-in Cursor UI with
  // NO extension contribution points. We cannot inject views or badges.
  // Monitor for an Agents Window extension API in future Cursor releases.
  // //////

  // ////// TODO: CURSOR WORKTREE CHANGE EVENTS
  // When the user switches between agent tabs (worktrees) in Cursor's
  // Agents Window, each worktree opens in a separate window. So there's
  // no in-window "switch" event — each window is independent.
  // Use vscode.workspace.workspaceFolders[0] as the current worktree.
  // //////

  // Set up Cursor-specific integration (if running in Cursor)
  setupCursorIntegration();
}

export function deactivate() {
  // Cleanup handled by disposables
}
