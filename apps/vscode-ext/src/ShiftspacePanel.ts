import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { MessageRouter } from './webview/MessageRouter';
import type { WebviewMessage } from './webview/MessageRouter';
import { SharedGitProvider } from './SharedGitProvider';
import { ActionCoordinator } from './actions/ActionCoordinator';
import { IconThemeProvider } from './IconThemeProvider';
import { InsightRunner } from './insights/runner';
import { DiagnosticCollector, collectDiagnostics } from './insights/plugins/diagnostics';
import { InspectionSession } from './insights/InspectionSession';
import { ViewSettingsStore } from './ViewSettingsStore';
import type { PersistedViewSettings } from './ViewSettingsStore';
// Register built-in insight plugins (side-effect import)
import './insights/plugins/codeSmells';
import type { DiffMode, AppMode, WorktreeState } from '@shiftspace/renderer';
import type { ShiftspaceMcpHttpServer } from './mcp/httpServer';
import { McpToolHandlers } from './mcp/handlers';

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
  private _iconProvider: IconThemeProvider | undefined;
  private _viewSettings: ViewSettingsStore | undefined;
  private _inspection: InspectionSession | undefined;
  private _insightRunner: InsightRunner | undefined;

  private _iconDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _settingsChangeDisposable: vscode.Disposable | undefined;
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

  // Constructor

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
      (message: WebviewMessage) => this._router.dispatch(message),
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
    this._iconProvider?.dispose();
    this._inspection?.dispose();
    this._settingsChangeDisposable?.dispose();
    this._removeFileChangeListener?.();
    this._removeRepoChangeListener?.();
    if (this._iconDebounceTimer !== undefined) {
      clearTimeout(this._iconDebounceTimer);
      this._iconDebounceTimer = undefined;
    }

    // Register this panel's postMessage with the shared git provider.
    // (Re-registers on every "ready" since the webview reference may change.)
    sharedGit.registerView(VIEW_ID, postMessage);

    // Create panel-specific helpers
    this._viewSettings = new ViewSettingsStore(this._context.workspaceState);
    this._iconProvider = new IconThemeProvider();

    this._insightRunner = new InsightRunner();
    const diagnosticCollector = new DiagnosticCollector(postMessage);

    this._actionCoordinator = new ActionCoordinator(postMessage);

    // Subscribe to per-worktree file changes for actions/icons/insights
    this._removeFileChangeListener = sharedGit.addFileChangeListener((worktreeId) => {
      this._actionCoordinator?.markAllStale(worktreeId);
      // Debounce icon resolution for new/changed files
      if (this._iconDebounceTimer !== undefined) clearTimeout(this._iconDebounceTimer);
      this._iconDebounceTimer = setTimeout(() => {
        this._iconDebounceTimer = undefined;
        void this.updateIcons();
      }, 1000);
      // Delegate insight/diagnostic debouncing to InspectionSession
      this._inspection?.onFileChange(worktreeId);
    });

    // Subscribe to repo switches for action coordinator re-init
    this._removeRepoChangeListener = sharedGit.addRepoChangeListener(async (newRoot) => {
      await this._actionCoordinator?.initialize(newRoot, this._viewSettings?.get().selectedPackage);
      this.syncWorktreesToCoordinator();
    });

    // Create inspection session (needs providers to be ready)
    this._inspection = new InspectionSession(this._insightRunner, diagnosticCollector, {
      postMessage,
      getWorktrees: () => sharedGit.provider?.getWorktrees() ?? [],
      getWorktreeFiles: (id) => sharedGit.provider?.getWorktreeFiles(id) ?? [],
      getCurrentGitRoot: () => sharedGit.currentGitRoot,
      getSmellRules: () => this._actionCoordinator?.getSmellRules() ?? [],
    });

    // Register message handlers
    this.registerHandlers();

    // Watch for icon theme changes
    this._settingsChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('workbench.iconTheme')) {
        void this.reloadIcons();
      }
    });

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
    this.registerMcpHandlers(gitRoot);
    this.restoreViewSettings(viewSettings);

    // Resolve and send file icons (non-blocking)
    void this.reloadIcons();
  }

  // Message handler registration

  private registerHandlers(): void {
    const sharedGit = ShiftspacePanel.sharedGit;
    if (!sharedGit) return;

    this._router.clear();

    this._router.on('ready', () => void this.onReady());

    // Git provider handlers — delegate to the shared GitDataProvider
    this._router.on('file-click', (m) => {
      void sharedGit.provider?.handleFileClick(
        m.worktreeId ?? '',
        m.filePath ?? '',
        typeof m.line === 'number' ? m.line : undefined
      );
    });
    this._router.on('set-diff-mode', (m) => {
      if (!m.worktreeId || !m.diffMode) return;
      const diffMode = m.diffMode as DiffMode;
      const wt = sharedGit.provider?.getWorktrees().find((w) => w.id === m.worktreeId);
      if (wt) {
        const settings = this._viewSettings!.get();
        settings.diffModeOverrides[wt.branch] = diffMode;
        this._viewSettings!.save({ diffModeOverrides: settings.diffModeOverrides });
      }
      void sharedGit.provider?.handleSetDiffMode(m.worktreeId, diffMode);
    });
    this._router.on('get-branch-list', (m) => {
      if (m.worktreeId) void sharedGit.provider?.handleGetBranchList(m.worktreeId);
    });
    this._router.on('checkout-branch', (m) => {
      if (m.worktreeId && m.branch)
        void sharedGit.provider?.handleCheckoutBranch(m.worktreeId, m.branch);
    });
    this._router.on('folder-click', (m) => {
      if (m.worktreeId && m.folderPath)
        void sharedGit.provider?.handleFolderClick(m.worktreeId, m.folderPath);
    });
    this._router.on('fetch-branches', (m) => {
      if (m.worktreeId) void sharedGit.provider?.handleFetchBranches(m.worktreeId);
    });
    this._router.on('swap-branches', (m) => {
      if (m.worktreeId) void sharedGit.provider?.handleSwapBranches(m.worktreeId);
    });
    this._router.on('remove-worktree', (m) => {
      if (m.worktreeId) void sharedGit.provider?.handleRemoveWorktree(m.worktreeId);
    });
    this._router.on('rename-worktree', (m) => {
      if (m.worktreeId && m.newName)
        void sharedGit.provider?.handleRenameWorktree(m.worktreeId, m.newName);
    });

    // Action coordinator handlers
    this._router.on('run-action', (m) => {
      if (m.worktreeId && m.actionId)
        void this._actionCoordinator?.runAction(m.worktreeId, m.actionId);
    });
    this._router.on('stop-action', (m) => {
      if (m.worktreeId && m.actionId) this._actionCoordinator?.stopAction(m.worktreeId, m.actionId);
    });
    this._router.on('run-pipeline', (m) => {
      if (m.worktreeId && m.pipelineId)
        void this._actionCoordinator?.runPipeline(m.worktreeId, m.pipelineId);
    });
    this._router.on('cancel-pipeline', (m) => {
      if (m.worktreeId) this._actionCoordinator?.cancelPipeline(m.worktreeId);
    });
    this._router.on('get-log', (m) => {
      if (m.worktreeId && m.actionId) this._actionCoordinator?.getLog(m.worktreeId, m.actionId);
    });
    this._router.on('set-package', (m) => {
      if (m.packageName === undefined) return;
      this._viewSettings!.save({ selectedPackage: m.packageName });
      void this._actionCoordinator?.setPackage(m.packageName);
    });
    this._router.on('detect-packages', () => {
      void this._actionCoordinator?.detectAndSendPackages();
    });

    // Inspection handlers
    this._router.on('enter-inspection', (m) => {
      if (!m.worktreeId) return;
      const wt = sharedGit.provider?.getWorktrees().find((w) => w.id === m.worktreeId);
      if (wt) {
        this._viewSettings!.save({ mode: { type: 'inspection', branch: wt.branch } });
      }
      this._inspection?.enter(m.worktreeId);
    });
    this._router.on('recheck-insights', (m) => {
      if (m.worktreeId) this._inspection?.recheck(m.worktreeId);
    });
    this._router.on('exit-inspection', () => {
      this._viewSettings!.save({ mode: { type: 'grove' } });
      this._inspection?.exit();
    });
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

  private async reloadIcons(): Promise<void> {
    const gitProvider = ShiftspacePanel.sharedGit?.provider;
    if (!this._iconProvider || !gitProvider) return;
    const loaded = await this._iconProvider.load();
    if (!loaded) return;
    const filePaths = gitProvider.getAllFilePaths();
    const iconMap = await this._iconProvider.resolveForFiles(filePaths);
    await this._panel.webview.postMessage({ type: 'icon-theme', payload: iconMap });
  }

  private async updateIcons(): Promise<void> {
    const gitProvider = ShiftspacePanel.sharedGit?.provider;
    if (!this._iconProvider?.isLoaded || !gitProvider) return;
    const filePaths = gitProvider.getAllFilePaths();
    const iconMap = await this._iconProvider.resolveForFiles(filePaths);
    await this._panel.webview.postMessage({ type: 'icon-theme', payload: iconMap });
  }

  private syncWorktreesToCoordinator(): void {
    const gitProvider = ShiftspacePanel.sharedGit?.provider;
    if (!gitProvider || !this._actionCoordinator) return;
    const worktrees = gitProvider.getWorktrees();
    this._actionCoordinator.updateWorktrees(
      worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }))
    );
  }

  private registerMcpHandlers(repoRoot: string): void {
    const server = ShiftspacePanel.mcpHttpServer;
    const gitProvider = ShiftspacePanel.sharedGit?.provider;
    if (!server || !gitProvider || !this._actionCoordinator) return;

    const coordinator = this._actionCoordinator;

    const handlers = new McpToolHandlers({
      worktreeProvider: {
        getWorktrees(): WorktreeState[] {
          const infos = gitProvider.getWorktrees();
          return infos.map((info) => ({
            id: info.id,
            path: info.path,
            branch: info.branch,
            files: gitProvider.getWorktreeFiles(info.id),
            diffMode: { type: 'working' as const },
            defaultBranch: 'main',
            isMainWorktree: false,
          }));
        },
      },
      configLoader: coordinator['configLoader'] as import('./actions/configLoader').ConfigLoader,
      stateManager: coordinator['stateManager'] as import('./actions/stateManager').StateManager,
      repoRoot,
      getPackageName: () => (coordinator['selectedPackage'] as string) ?? '',
      collectDiagnostics,
      insightRunner: this._insightRunner,
      getSmellRules: () => coordinator.getSmellRules(),
    });

    server.setHandlers(handlers);
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

    if (this._iconDebounceTimer !== undefined) {
      clearTimeout(this._iconDebounceTimer);
      this._iconDebounceTimer = undefined;
    }
    this._settingsChangeDisposable?.dispose();
    this._settingsChangeDisposable = undefined;

    this._insightStatusBar?.dispose();
    this._insightStatusBar = undefined;
    this._inspection?.dispose();
    this._inspection = undefined;
    this._actionCoordinator?.dispose();
    this._actionCoordinator = undefined;
    this._iconProvider?.dispose();
    this._iconProvider = undefined;

    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
