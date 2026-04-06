import * as vscode from 'vscode';
import * as path from 'path';
import { getGitRoot } from '@shiftspace/core';

/**
 * Webview panel for the Shiftspace Inspection view in Cursor.
 *
 * Skips the Grove view entirely — goes straight to Inspection for the
 * current worktree (detected from the workspace folder's git root).
 */
export class CursorShiftspacePanel {
  private static currentPanel: CursorShiftspacePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (CursorShiftspacePanel.currentPanel) {
      CursorShiftspacePanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'shiftspace-inspection',
      'Shiftspace Inspection',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
      }
    );

    CursorShiftspacePanel.currentPanel = new CursorShiftspacePanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Initialize the webview
    void this.initialize();
  }

  private async initialize() {
    // Detect the current worktree from the workspace folder
    const worktreeId = await this.detectWorktreeId();

    // ////// TODO: WEBVIEW HTML
    // Once the cursor-ext has its own webview build (sharing @shiftspace/renderer),
    // load the webview HTML here and send the force-inspection message.
    //
    // For now, show a placeholder that confirms the extension activates correctly.
    // The full webview integration requires:
    // 1. A Vite build step for the webview (similar to vscode-ext/src/webview/)
    // 2. Loading the renderer with InspectionView
    // 3. Sending the force-inspection message to skip Grove
    // //////

    this.panel.webview.html = this.getPlaceholderHtml(worktreeId);

    // ////// TODO: FULL WEBVIEW INTEGRATION
    // When the webview build is set up, send this message to skip Grove:
    //
    // this.panel.webview.postMessage({
    //   type: 'force-inspection',
    //   worktreeId: worktreeId,
    // });
    //
    // The renderer needs to handle this message in the inspection store:
    // if (msg.type === 'force-inspection') {
    //   useInspectionStore.getState().enterInspection(msg.worktreeId);
    // }
    // //////
  }

  private async detectWorktreeId(): Promise<string> {
    // Try workspace folder first (most reliable in Cursor's per-worktree windows)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const gitRoot = await getGitRoot(workspaceFolder);
      if (gitRoot) {
        return `wt-${path.basename(gitRoot)}`;
      }
    }

    // Fall back to active editor's file
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (activeFile) {
      const dir = path.dirname(activeFile);
      const gitRoot = await getGitRoot(dir);
      if (gitRoot) {
        return `wt-${path.basename(gitRoot)}`;
      }
    }

    return 'wt-0';
  }

  private getPlaceholderHtml(worktreeId: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shiftspace Inspection</title>
  <style>
    body {
      background: var(--vscode-editor-background, #1e1e2e);
      color: var(--vscode-editor-foreground, #cdd6f4);
      font-family: var(--vscode-font-family, monospace);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 2rem;
      text-align: center;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .worktree-id { opacity: 0.6; font-size: 0.85rem; }
    .status { margin-top: 1.5rem; opacity: 0.5; font-size: 0.8rem; max-width: 400px; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      background: var(--vscode-badge-background, #45475a);
      color: var(--vscode-badge-foreground, #cdd6f4);
      font-size: 0.75rem;
      margin-top: 0.5rem;
    }
  </style>
</head>
<body>
  <h1>Shiftspace Inspection</h1>
  <div class="worktree-id">Worktree: ${worktreeId}</div>
  <div class="badge">Cursor Edition</div>
  <div class="status">
    Extension scaffold active. The full Inspection view (file list, hierarchy,
    checks, insights) will render here once the webview build is wired up.
  </div>
</body>
</html>`;
  }

  private dispose() {
    CursorShiftspacePanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}
