import * as vscode from 'vscode';
import { ShiftspacePanel } from './shiftspace-panel';
import { SidebarViewProvider } from './sidebar-view-provider';
import { runDetectActionsCommand } from './actions/detect';
import { ShiftspaceMcpHttpServer } from './mcp/http-server';
import { installMcpServerBinary, configureClaudeCode, configureCursor } from './mcp/auto-config';
import { initLogger, log } from './logger';

const mcpHttpServer = new ShiftspaceMcpHttpServer();

export function activate(context: vscode.ExtensionContext) {
  initLogger(context);

  // Restore any Shiftspace tabs that were open before a window reload.
  // Must be registered synchronously at activation time.
  ShiftspacePanel.registerSerializer(context);

  // Start the MCP HTTP server (non-blocking)
  void startMcpServer(context);

  // Activity bar sidebar: renders slim grove view with worktree cards
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'shiftspace.sidebar',
      new SidebarViewProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
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

  context.subscriptions.push(
    vscode.commands.registerCommand('shiftspace.recheckInsights', () => {
      ShiftspacePanel.recheckInsights();
    })
  );

  // Expose the MCP HTTP server so ShiftspacePanel can register handlers
  ShiftspacePanel.setMcpHttpServer(mcpHttpServer);

  context.subscriptions.push({ dispose: () => void mcpHttpServer.stop() });
}

export function deactivate() {
  void mcpHttpServer.stop();
}

async function startMcpServer(context: vscode.ExtensionContext): Promise<void> {
  try {
    await mcpHttpServer.start();
    await installMcpServerBinary(context.extensionPath);
    void promptMcpConfiguration();
  } catch (err) {
    log.error('Failed to start MCP HTTP server:', err);
  }
}

const MCP_CONFIGURED_KEY = 'mcpConfigured';

async function promptMcpConfiguration(): Promise<void> {
  // Only prompt once per workspace
  const config = vscode.workspace.getConfiguration('shiftspace');
  if (config.get<boolean>(MCP_CONFIGURED_KEY)) return;

  const choice = await vscode.window.showInformationMessage(
    'Shiftspace MCP server is ready. Configure your agent to use it?',
    'Configure for Claude Code',
    'Configure for Cursor',
    'Dismiss'
  );

  if (choice === 'Configure for Claude Code') {
    try {
      await configureClaudeCode();
      void vscode.window.showInformationMessage('Shiftspace MCP configured for Claude Code.');
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to configure Claude Code: ${err}`);
    }
  } else if (choice === 'Configure for Cursor') {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }
    try {
      await configureCursor(workspaceRoot);
      void vscode.window.showInformationMessage('Shiftspace MCP configured for Cursor.');
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to configure Cursor: ${err}`);
    }
  }

  // Persist regardless of choice so the prompt doesn't reappear
  await config.update(MCP_CONFIGURED_KEY, true, vscode.ConfigurationTarget.Global);
}
