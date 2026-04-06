import * as vscode from 'vscode';
import { getWebviewHtml } from './webview/html';
import { MessageRouter } from './webview/MessageRouter';
import type { WebviewMessage } from './webview/MessageRouter';
import { GitDataProvider } from './GitDataProvider';
import { ActionCoordinator } from './actions/ActionCoordinator';
import { IconThemeProvider } from './IconThemeProvider';
import { InsightRunner } from './insights/runner';
import { DiagnosticCollector, collectDiagnostics } from './insights/plugins/diagnostics';
import { InspectionSession } from './insights/InspectionSession';
import { ViewSettingsStore } from './ViewSettingsStore';
import type { PersistedViewSettings } from './ViewSettingsStore';
import { RepoTracker } from './git/RepoTracker';
// Register built-in insight plugins (side-effect import)
import './insights/plugins/codeSmells';
import type { DiffMode, AppMode, WorktreeState } from '@shiftspace/renderer';
import type { ShiftspaceMcpHttpServer } from './mcp/httpServer';
import { McpToolHandlers } from './mcp/handlers';

export class ShiftspacePanel {
  private static currentPanel: ShiftspacePanel | undefined;
  private static mcpHttpServer: ShiftspaceMcpHttpServer | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _router = new MessageRouter();
  private _disposables: vscode.Disposable[] = [];

  private _gitProvider: GitDataProvider | undefined;
  private _actionCoordinator: ActionCoordinator | undefined;
  private _iconProvider: IconThemeProvider | undefined;
  private _viewSettings: ViewSettingsStore | undefined;
  private _repoTracker: RepoTracker | undefined;
  private _inspection: InspectionSession | undefined;

  private _iconDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _settingsChangeDisposable: vscode.Disposable | undefined;
  private _insightStatusBar: vscode.StatusBarItem | undefined;

  // ---------------------------------------------------------------------------
  // Static API (consumed by extension.ts)
  // ---------------------------------------------------------------------------

  static setMcpHttpServer(server: ShiftspaceMcpHttpServer): void {
    ShiftspacePanel.mcpHttpServer = server;
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
    // Prefer current inspection worktree, fall back to first available
    const wt = panel._inspection?.currentWorktreeId ?? panel._gitProvider?.getWorktrees()[0]?.id;
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

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Initialization (called when webview sends "ready")
  // ---------------------------------------------------------------------------

  private async onReady(): Promise<void> {
    const postMessage = (msg: object) => {
      void this._panel.webview.postMessage(msg);
      // Mirror insight status to the VS Code status bar
      if ((msg as { type: string }).type === 'insights-status') {
        this.updateInsightStatusBar((msg as { running: boolean }).running);
      }
    };

    // Dispose previous providers
    this._gitProvider?.dispose();
    this._actionCoordinator?.dispose();
    this._iconProvider?.dispose();
    this._inspection?.dispose();
    this._repoTracker?.dispose();
    this._settingsChangeDisposable?.dispose();
    if (this._iconDebounceTimer !== undefined) {
      clearTimeout(this._iconDebounceTimer);
      this._iconDebounceTimer = undefined;
    }

    // Create helpers
    this._viewSettings = new ViewSettingsStore(this._context.workspaceState);
    this._repoTracker = new RepoTracker();
    this._iconProvider = new IconThemeProvider();

    const insightRunner = new InsightRunner();
    const diagnosticCollector = new DiagnosticCollector(postMessage);

    // Create providers
    this._gitProvider = new GitDataProvider(postMessage, (worktreeId) => {
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

    this._actionCoordinator = new ActionCoordinator(postMessage);

    // Create inspection session (needs providers to be ready)
    this._inspection = new InspectionSession(insightRunner, diagnosticCollector, {
      postMessage,
      getWorktrees: () => this._gitProvider?.getWorktrees() ?? [],
      getWorktreeFiles: (id) => this._gitProvider?.getWorktreeFiles(id) ?? [],
      getCurrentGitRoot: () => this._repoTracker?.currentGitRoot,
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

    // Watch for repo switching on editor change
    this._repoTracker.startWatching(async (newRoot) => {
      await this._gitProvider?.switchRepo(newRoot);
      await this._actionCoordinator?.initialize(newRoot, this._viewSettings?.get().selectedPackage);
      this.syncWorktreesToCoordinator();
    });

    // Detect git root and initialize
    const gitRoot = await this._repoTracker.detectInitialGitRoot();

    if (!gitRoot) {
      const hasSomething =
        vscode.window.activeTextEditor || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      postMessage({
        type: 'error',
        message: hasSomething ? 'No git repository found' : 'Open a file to get started',
      });
      return;
    }

    await this._gitProvider.switchRepo(gitRoot);

    // Apply persisted diff mode overrides before the webview renders
    const viewSettings = this._viewSettings.get();
    this._gitProvider.applyDiffModeOverrides(viewSettings.diffModeOverrides);

    await this._actionCoordinator.initialize(gitRoot, viewSettings.selectedPackage);
    this.syncWorktreesToCoordinator();
    this.registerMcpHandlers(gitRoot);
    this.restoreViewSettings(viewSettings);

    // Resolve and send file icons (non-blocking)
    void this.reloadIcons();
  }

  // ---------------------------------------------------------------------------
  // Message handler registration
  // ---------------------------------------------------------------------------

  private registerHandlers(): void {
    this._router.clear();

    this._router.on('ready', () => void this.onReady());

    // Git provider handlers
    this._router.on('file-click', (m) => {
      void this._gitProvider?.handleFileClick(m.worktreeId ?? '', m.filePath ?? '');
    });
    this._router.on('set-diff-mode', (m) => {
      if (!m.worktreeId || !m.diffMode) return;
      const diffMode = m.diffMode as DiffMode;
      const wt = this._gitProvider?.getWorktrees().find((w) => w.id === m.worktreeId);
      if (wt) {
        const settings = this._viewSettings!.get();
        settings.diffModeOverrides[wt.branch] = diffMode;
        this._viewSettings!.save({ diffModeOverrides: settings.diffModeOverrides });
      }
      void this._gitProvider?.handleSetDiffMode(m.worktreeId, diffMode);
    });
    this._router.on('get-branch-list', (m) => {
      if (m.worktreeId) void this._gitProvider?.handleGetBranchList(m.worktreeId);
    });
    this._router.on('checkout-branch', (m) => {
      if (m.worktreeId && m.branch)
        void this._gitProvider?.handleCheckoutBranch(m.worktreeId, m.branch);
    });
    this._router.on('folder-click', (m) => {
      if (m.worktreeId && m.folderPath)
        void this._gitProvider?.handleFolderClick(m.worktreeId, m.folderPath);
    });
    this._router.on('fetch-branches', (m) => {
      if (m.worktreeId) void this._gitProvider?.handleFetchBranches(m.worktreeId);
    });
    this._router.on('swap-branches', (m) => {
      if (m.worktreeId) void this._gitProvider?.handleSwapBranches(m.worktreeId);
    });
    this._router.on('remove-worktree', (m) => {
      if (m.worktreeId) void this._gitProvider?.handleRemoveWorktree(m.worktreeId);
    });
    this._router.on('rename-worktree', (m) => {
      if (m.worktreeId && m.newName)
        void this._gitProvider?.handleRenameWorktree(m.worktreeId, m.newName);
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
      const wt = this._gitProvider?.getWorktrees().find((w) => w.id === m.worktreeId);
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

  // ---------------------------------------------------------------------------
  // Small helpers (stay inline — not worth extracting)
  // ---------------------------------------------------------------------------

  private restoreViewSettings(settings: PersistedViewSettings): void {
    const worktrees = this._gitProvider?.getWorktrees() ?? [];

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
    if (!this._iconProvider || !this._gitProvider) return;
    const loaded = await this._iconProvider.load();
    if (!loaded) return;
    const filePaths = this._gitProvider.getAllFilePaths();
    const iconMap = await this._iconProvider.resolveForFiles(filePaths);
    await this._panel.webview.postMessage({ type: 'icon-theme', payload: iconMap });
  }

  private async updateIcons(): Promise<void> {
    if (!this._iconProvider?.isLoaded || !this._gitProvider) return;
    const filePaths = this._gitProvider.getAllFilePaths();
    const iconMap = await this._iconProvider.resolveForFiles(filePaths);
    await this._panel.webview.postMessage({ type: 'icon-theme', payload: iconMap });
  }

  private syncWorktreesToCoordinator(): void {
    if (!this._gitProvider || !this._actionCoordinator) return;
    const worktrees = this._gitProvider.getWorktrees();
    this._actionCoordinator.updateWorktrees(
      worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }))
    );
  }

  private registerMcpHandlers(repoRoot: string): void {
    const server = ShiftspacePanel.mcpHttpServer;
    if (!server || !this._gitProvider || !this._actionCoordinator) return;

    const gitProvider = this._gitProvider;
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
    });

    server.setHandlers(handlers);
  }

  // ---------------------------------------------------------------------------
  // Insight status bar
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Disposal
  // ---------------------------------------------------------------------------

  private dispose() {
    ShiftspacePanel.currentPanel = undefined;

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
    this._repoTracker?.dispose();
    this._repoTracker = undefined;
    this._gitProvider?.dispose();
    this._gitProvider = undefined;
    this._actionCoordinator?.dispose();
    this._actionCoordinator = undefined;
    this._iconProvider?.dispose();
    this._iconProvider = undefined;

    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
