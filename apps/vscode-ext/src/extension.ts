import * as vscode from 'vscode';
import { ShiftspacePanel } from './shiftspace-panel';
import { SidebarViewProvider } from './sidebar-view-provider';
import { SharedGitProvider } from './shared-git-provider';
import { runDetectActionsCommand } from './actions/detect';
import { ShiftspaceMcpHttpServer } from './mcp/http-server';
import { installMcpServerBinary, configureClaudeCode, configureCursor } from './mcp/auto-config';
import { initLogger, log } from './logger';
import { initGitPath } from './git/git-utils';
import { initTelemetry, closeTelemetry, reportError } from './telemetry';

const mcpHttpServer = new ShiftspaceMcpHttpServer();

export function activate(context: vscode.ExtensionContext) {
  initLogger(context);
  initGitPath();

  // Initialize telemetry (respects opt-in setting + VSCode global telemetry)
  const ext = vscode.extensions.getExtension('shiftspace.shiftspace');
  const version = ext?.packageJSON.version ?? 'unknown';
  initTelemetry(version);

  // Global error handlers — catch-all for unhandled errors
  process.on('uncaughtException', (err) => {
    reportError(err, { context: 'uncaughtException' });
  });
  process.on('unhandledRejection', (reason) => {
    if (reason instanceof Error) {
      reportError(reason, { context: 'unhandledRejection' });
    }
  });

  // Show first-run telemetry opt-in prompt (only once, ever)
  void promptTelemetryOptIn(context, version);

  // Single shared git provider — both sidebar and tab subscribe to the same
  // GitDataProvider so mutations (rename, checkout, swap) are reflected
  // instantly across all views.
  const sharedGit = new SharedGitProvider();
  context.subscriptions.push(sharedGit);

  // Restore any Shiftspace tabs that were open before a window reload.
  // Must be registered synchronously at activation time.
  ShiftspacePanel.registerSerializer(context);

  // Start the MCP HTTP server (non-blocking)
  void startMcpServer(context);

  // Activity bar sidebar: renders slim grove view with worktree cards
  const sidebarProvider = new SidebarViewProvider(context, sharedGit);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shiftspace.sidebar', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
  context.subscriptions.push(sidebarProvider.registerSortCommand());

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

  // Expose the MCP HTTP server and shared git provider so ShiftspacePanel can use them
  ShiftspacePanel.setMcpHttpServer(mcpHttpServer);
  ShiftspacePanel.setSharedGitProvider(sharedGit);

  context.subscriptions.push({ dispose: () => void mcpHttpServer.stop() });
}

export async function deactivate() {
  void mcpHttpServer.stop();
  await closeTelemetry();
}

async function startMcpServer(context: vscode.ExtensionContext): Promise<void> {
  try {
    await mcpHttpServer.start();
    await installMcpServerBinary(context.extensionPath);
    void promptMcpConfiguration();
  } catch (err) {
    log.error('Failed to start MCP HTTP server:', err);
    reportError(err as Error, { context: 'mcpServerStart' });
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

const TELEMETRY_PROMPT_KEY = 'shiftspace.telemetryPromptShown';

async function promptTelemetryOptIn(
  context: vscode.ExtensionContext,
  extensionVersion: string
): Promise<void> {
  if (context.globalState.get(TELEMETRY_PROMPT_KEY)) return;

  const choice = await vscode.window.showInformationMessage(
    'Shiftspace: Help improve the extension by sending anonymous error reports?',
    'Enable',
    'No thanks'
  );

  if (choice === 'Enable') {
    await vscode.workspace
      .getConfiguration('shiftspace')
      .update('telemetry.enabled', true, vscode.ConfigurationTarget.Global);
    // Re-init now that it's enabled
    initTelemetry(extensionVersion);
  }

  // Don't show again regardless of choice
  await context.globalState.update(TELEMETRY_PROMPT_KEY, true);
}
