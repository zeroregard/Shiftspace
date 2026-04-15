import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { MessageRouter } from './webview/message-router';
import type { WebviewMessage } from './webview/message-router';
import { SharedGitProvider } from './shared-git-provider';
import { ActionCoordinator } from './actions/action-coordinator';
import { InsightRunner } from './insights/runner';
import { DiagnosticCollector } from './insights/plugins/diagnostics';
import { InspectionSession } from './insights/inspection-session';
import { ViewSettingsStore } from './view-settings-store';
import type { PersistedViewSettings } from './view-settings-store';
// Register built-in insight plugins (side-effect import)
import './insights/plugins/code-smells';
import type { AppMode } from '@shiftspace/renderer';
import type { ShiftspaceMcpHttpServer } from './mcp/http-server';
import { registerPanelHandlers } from './panel-handlers';
import { registerMcpHandlers } from './panel-mcp-bridge';
import { PanelIconManager } from './panel-icon-manager';
import { reportError } from './telemetry';

const VIEW_ID = 'panel';

export class ShiftspacePanel {
  private static currentPanel: ShiftspacePanel | undefined;
  private static mcpHttpServer: ShiftspaceMcpHttpServer | undefined;
  private static sharedGit: SharedGitProvider | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _router = new MessageRouter();
  private _disposables: vscode.Disposable[] = [];

  private _actionCoordinator: ActionCoordinator | undefined;
  private _iconManager: PanelIconManager | undefined;
  private _viewSettings: ViewSettingsStore | undefined;
  private _inspection: InspectionSession | undefined;
  private _insightRunner: InsightRunner | undefined;
  private _diagnosticCollector: DiagnosticCollector | undefined;

  private _insightStatusBar: vscode.StatusBarItem | undefined;
  private _removeFileChangeListener: (() => void) | undefined;
  private _removeRepoChangeListener: (() => void) | undefined;

  // Static API (consumed by extension.ts)

  static setMcpHttpServer(server: ShiftspaceMcpHttpServer): void {
    ShiftspacePanel.mcpHttpServer = server;
  }

  static setSharedGitProvider(shared: SharedGitProvider): void {
    ShiftspacePanel.sharedGit = shared;
  }

  static toggle(context: vscode.ExtensionContext) {
    if (ShiftspacePanel.currentPanel) {
      ShiftspacePanel.currentPanel.dispose();
    } else {
      ShiftspacePanel.createOrShow(context);
    }
  }

  static registerSerializer(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer('shiftspace', {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
          panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
          };
          ShiftspacePanel.currentPanel = new ShiftspacePanel(panel, context);
        },
      })
    );
  }

  static recheckInsights(): void {
    const panel = ShiftspacePanel.currentPanel;
    if (!panel) return;
    const sharedGit = ShiftspacePanel.sharedGit;
    // Prefer current inspection worktree, fall back to first available
    const wt = panel._inspection?.currentWorktreeId ?? sharedGit?.provider?.getWorktrees()[0]?.id;
    if (wt) {
      // Show spinner immediately (don't rely on the async postMessage round-trip)
      panel.updateInsightStatusBar(true);
      panel._inspection?.recheck(wt);
    }
  }

  static openInspection(context: vscode.ExtensionContext, worktreeId: string) {
    ShiftspacePanel.createOrShow(context);
    // Post the enter-inspection message once the panel is ready.
    // If the panel already exists it's already ready; if it was just created,
    // the webview will queue messages until its "ready" handler fires.
    void ShiftspacePanel.currentPanel?._panel.webview.postMessage({
      type: 'restore-view-settings',
      mode: { type: 'inspection', worktreeId },
    });
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
    this._context = context;
    this._panel.iconPath = {
      light: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-dark.svg'),
    };
    this._panel.webview.html = getWebviewHtml(this._panel.webview, context.extensionUri);

    // Register the ready handler immediately so the first "ready" message
    // from the webview is not silently dropped (all other handlers are
    // registered inside onReady → registerHandlers).
    this._router.on('ready', () => void this.onReady());

    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        try {
          this._router.dispatch(message);
        } catch (err) {
          reportError(err as Error, { context: 'webviewMessage', messageType: message.type });
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  // Initialization (called when webview sends "ready")

  private async onReady(): Promise<void> {
    const sharedGit = ShiftspacePanel.sharedGit;
    if (!sharedGit) return;

    const postMessage = (msg: object) => {
      void this._panel.webview.postMessage(msg);
      // Mirror insight status to the VS Code status bar
      if ((msg as { type: string }).type === 'insights-status') {
        this.updateInsightStatusBar((msg as { running: boolean }).running);
      }
    };

    // Dispose previous panel-specific providers
    this._actionCoordinator?.dispose();
    this._iconManager?.dispose();
    this._inspection?.dispose();
    this._diagnosticCollector?.dispose();
    this._removeFileChangeListener?.();
    this._removeRepoChangeListener?.();

    // Register this panel's postMessage with the shared git provider.
    // (Re-registers on every "ready" since the webview reference may change.)
    sharedGit.registerView(VIEW_ID, postMessage);

    // Create panel-specific helpers
    this._viewSettings = new ViewSettingsStore(this._context.workspaceState);
    this._iconManager = new PanelIconManager(sharedGit, (msg) =>
      this._panel.webview.postMessage(msg)
    );

    this._insightRunner = new InsightRunner();
    this._diagnosticCollector = new DiagnosticCollector(postMessage);

    this._actionCoordinator = new ActionCoordinator(postMessage);

    // Subscribe to per-worktree file changes for actions/icons/insights
    this._removeFileChangeListener = sharedGit.addFileChangeListener((worktreeId) => {
      this._actionCoordinator?.markAllStale(worktreeId);
      this._iconManager?.scheduleUpdate();
      // Delegate insight/diagnostic debouncing to InspectionSession
      this._inspection?.onFileChange(worktreeId);
    });

    // Subscribe to repo switches for action coordinator re-init
    this._removeRepoChangeListener = sharedGit.addRepoChangeListener(async (newRoot) => {
      await this._actionCoordinator?.initialize(newRoot, this._viewSettings?.get().selectedPackage);
      this.syncWorktreesToCoordinator();
    });

    // Create inspection session (needs providers to be ready)
    this._inspection = new InspectionSession(this._insightRunner, this._diagnosticCollector, {
      postMessage,
      getWorktrees: () => sharedGit.provider?.getWorktrees() ?? [],
      getWorktreeFiles: (id) => sharedGit.provider?.getWorktreeFiles(id) ?? [],
      getCurrentGitRoot: () => sharedGit.currentGitRoot,
      getSmellRules: () => this._actionCoordinator?.getSmellRules() ?? [],
    });

    // Register message handlers
    this.registerHandlers();

    // Ensure the shared git provider is initialized (no-ops if already done)
    const gitRoot = await sharedGit.ensureInitialized();

    if (!gitRoot) {
      const hasSomething =
        vscode.window.activeTextEditor || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      postMessage({
        type: 'error',
        message: hasSomething ? 'No git repository found' : 'Open a file to get started',
      });
      return;
    }

    // Apply persisted diff mode overrides before the webview renders
    const viewSettings = this._viewSettings.get();
    sharedGit.provider?.applyDiffModeOverrides(viewSettings.diffModeOverrides);

    await this._actionCoordinator.initialize(gitRoot, viewSettings.selectedPackage);
    this.syncWorktreesToCoordinator();

    const server = ShiftspacePanel.mcpHttpServer;
    const gitProvider = sharedGit.provider;
    if (server && gitProvider && this._actionCoordinator) {
      registerMcpHandlers({
        server,
        gitProvider,
        coordinator: this._actionCoordinator,
        insightRunner: this._insightRunner,
        repoRoot: gitRoot,
      });
    }

    this.restoreViewSettings(viewSettings);

    // Resolve and send file icons (non-blocking)
    void this._iconManager?.reload();
  }

  // Message handler registration

  private registerHandlers(): void {
    const sharedGit = ShiftspacePanel.sharedGit;
    if (!sharedGit) return;

    registerPanelHandlers(
      this._router,
      {
        sharedGit,
        actionCoordinator: this._actionCoordinator,
        viewSettings: this._viewSettings,
        inspection: this._inspection,
      },
      () => void this.onReady()
    );
  }

  // Small helpers (stay inline — not worth extracting)

  private restoreViewSettings(settings: PersistedViewSettings): void {
    const worktrees = ShiftspacePanel.sharedGit?.provider?.getWorktrees() ?? [];

    let mode: AppMode = { type: 'grove' };
    const savedMode = settings.mode;
    if (savedMode.type === 'inspection') {
      const wt = worktrees.find((w) => w.branch === savedMode.branch);
      if (wt) {
        mode = { type: 'inspection', worktreeId: wt.id };
      }
    }

    void this._panel.webview.postMessage({
      type: 'restore-view-settings',
      mode,
      selectedPackage: settings.selectedPackage,
    });
  }

  private syncWorktreesToCoordinator(): void {
    const gitProvider = ShiftspacePanel.sharedGit?.provider;
    if (!gitProvider || !this._actionCoordinator) return;
    const worktrees = gitProvider.getWorktrees();
    this._actionCoordinator.updateWorktrees(
      worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }))
    );
  }

  // Insight status bar

  private updateInsightStatusBar(running: boolean): void {
    if (!this._insightStatusBar) {
      this._insightStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
      this._insightStatusBar.command = 'shiftspace.recheckInsights';
      this._insightStatusBar.show();
    }

    if (running) {
      this._insightStatusBar.text = '$(sync~spin)';
      this._insightStatusBar.tooltip = 'Analyzing files for code smells…';
    } else {
      this._insightStatusBar.text = '$(shiftspace-icon)';
      this._insightStatusBar.tooltip = 'Click to recheck code smells';
    }
  }

  // Disposal

  private dispose() {
    ShiftspacePanel.currentPanel = undefined;

    // Unregister from shared provider (do NOT dispose the shared provider itself)
    ShiftspacePanel.sharedGit?.unregisterView(VIEW_ID);
    this._removeFileChangeListener?.();
    this._removeFileChangeListener = undefined;
    this._removeRepoChangeListener?.();
    this._removeRepoChangeListener = undefined;

    this._insightStatusBar?.dispose();
    this._insightStatusBar = undefined;
    this._inspection?.dispose();
    this._inspection = undefined;
    this._diagnosticCollector?.dispose();
    this._diagnosticCollector = undefined;
    this._actionCoordinator?.dispose();
    this._actionCoordinator = undefined;
    this._iconManager?.dispose();
    this._iconManager = undefined;

    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
