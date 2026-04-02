import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider } from './GitDataProvider';
import { ActionCoordinator } from './actions/ActionCoordinator';
import { log } from './logger';
import { getGitRoot } from './git/worktrees';
import { IconThemeProvider } from './IconThemeProvider';
import { InsightRunner } from './insights/runner';
import { DiagnosticCollector, collectDiagnostics } from './insights/plugins/diagnostics';
// Register built-in insight plugins (side-effect import)
import './insights/plugins/codeSmells';
import type { DiffMode, AppMode, WorktreeState } from '@shiftspace/renderer';
import type { ShiftspaceMcpHttpServer } from './mcp/httpServer';
import { McpToolHandlers } from './mcp/handlers';

// ---------------------------------------------------------------------------
// Webview message shape
// ---------------------------------------------------------------------------

interface WebviewMessage {
  type: string;
  worktreeId?: string;
  filePath?: string;
  diffMode?: unknown;
  branch?: string;
  folderPath?: string;
  actionId?: string;
  pipelineId?: string;
  packageName?: string;
  newName?: string;
}

// ---------------------------------------------------------------------------
// Persisted view settings — survives "Reload Window"
// ---------------------------------------------------------------------------

interface PersistedViewSettings {
  /** App mode, using branch name instead of worktree ID for stability. */
  mode: { type: 'grove' } | { type: 'inspection'; branch: string };
  /** Per-branch diff mode overrides (branch name → DiffMode). */
  diffModeOverrides: Record<string, DiffMode>;
  /** Selected package filter. */
  selectedPackage: string;
}

const VIEW_SETTINGS_KEY = 'shiftspace.viewSettings';

const DEFAULT_VIEW_SETTINGS: PersistedViewSettings = {
  mode: { type: 'grove' },
  diffModeOverrides: {},
  selectedPackage: '',
};

export class ShiftspacePanel {
  private static currentPanel: ShiftspacePanel | undefined;
  private static mcpHttpServer: ShiftspaceMcpHttpServer | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _gitProvider: GitDataProvider | undefined;
  private _actionCoordinator: ActionCoordinator | undefined;

  private _iconProvider: IconThemeProvider | undefined;
  private _insightRunner: InsightRunner | undefined;
  private _diagnosticCollector: DiagnosticCollector | undefined;

  // Insight state
  private _currentInspectedWorktreeId: string | undefined;
  private _insightDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  /** Abort controller for the current in-flight insight run (per worktree). */
  private _insightAbortController: AbortController | undefined;

  // Workspace-switching state
  private _gitRootCache = new Map<string, string>(); // dir → gitRoot
  private _currentGitRoot: string | undefined;
  private _repoSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  private _editorChangeDisposable: vscode.Disposable | undefined;
  private _settingsChangeDisposable: vscode.Disposable | undefined;

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
  // View settings persistence
  // ---------------------------------------------------------------------------

  private _getViewSettings(): PersistedViewSettings {
    return this._context.workspaceState.get<PersistedViewSettings>(
      VIEW_SETTINGS_KEY,
      DEFAULT_VIEW_SETTINGS
    );
  }

  private _saveViewSettings(patch: Partial<PersistedViewSettings>): void {
    const current = this._getViewSettings();
    void this._context.workspaceState.update(VIEW_SETTINGS_KEY, { ...current, ...patch });
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._panel.webview.html = getWebviewHtml(this._panel.webview, context.extensionUri);

    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this._handleMessage(message),
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  // ---------------------------------------------------------------------------
  // Message dispatch — each case is a tiny private method
  // ---------------------------------------------------------------------------

  private readonly _messageHandlers: Record<string, (msg: WebviewMessage) => void> = {
    ready: () => void this.onReady(),
    'file-click': (m) => this._handleFileClick(m),
    'set-diff-mode': (m) => this._handleSetDiffMode(m),
    'get-branch-list': (m) => this._handleGetBranchList(m),
    'checkout-branch': (m) => this._handleCheckoutBranch(m),
    'folder-click': (m) => this._handleFolderClick(m),
    'fetch-branches': (m) => this._handleFetchBranches(m),
    'swap-branches': (m) => this._handleSwapBranches(m),
    'remove-worktree': (m) => this._handleRemoveWorktree(m),
    'rename-worktree': (m) => this._handleRenameWorktree(m),
    'run-action': (m) => this._handleRunAction(m),
    'stop-action': (m) => this._handleStopAction(m),
    'run-pipeline': (m) => this._handleRunPipeline(m),
    'cancel-pipeline': (m) => this._handleCancelPipeline(m),
    'get-log': (m) => this._handleGetLog(m),
    'set-package': (m) => this._handleSetPackage(m),
    'detect-packages': () => void this._actionCoordinator?.detectAndSendPackages(),
    'enter-inspection': (m) => this._handleEnterInspection(m),
    'recheck-insights': (m) => this._handleRecheckInsights(m),
    'exit-inspection': () => this._handleExitInspection(),
  };

  private _handleMessage(message: WebviewMessage): void {
    this._messageHandlers[message.type]?.(message);
  }

  private _handleFileClick(message: WebviewMessage): void {
    void this._gitProvider?.handleFileClick(message.worktreeId ?? '', message.filePath ?? '');
  }

  private _handleSetDiffMode(message: WebviewMessage): void {
    if (!message.worktreeId || !message.diffMode) return;
    const diffMode = message.diffMode as DiffMode;
    const wt = this._gitProvider?.getWorktrees().find((w) => w.id === message.worktreeId);
    if (wt) {
      const settings = this._getViewSettings();
      settings.diffModeOverrides[wt.branch] = diffMode;
      this._saveViewSettings({ diffModeOverrides: settings.diffModeOverrides });
    }
    void this._gitProvider?.handleSetDiffMode(message.worktreeId, diffMode);
  }

  private _handleGetBranchList(message: WebviewMessage): void {
    if (!message.worktreeId) return;
    void this._gitProvider?.handleGetBranchList(message.worktreeId);
  }

  private _handleCheckoutBranch(message: WebviewMessage): void {
    if (!message.worktreeId || !message.branch) return;
    void this._gitProvider?.handleCheckoutBranch(message.worktreeId, message.branch);
  }

  private _handleFolderClick(message: WebviewMessage): void {
    if (!message.worktreeId || !message.folderPath) return;
    void this._gitProvider?.handleFolderClick(message.worktreeId, message.folderPath);
  }

  private _handleFetchBranches(message: WebviewMessage): void {
    if (!message.worktreeId) return;
    void this._gitProvider?.handleFetchBranches(message.worktreeId);
  }

  private _handleSwapBranches(message: WebviewMessage): void {
    if (!message.worktreeId) return;
    void this._gitProvider?.handleSwapBranches(message.worktreeId);
  }

  private _handleRemoveWorktree(message: WebviewMessage): void {
    if (!message.worktreeId) return;
    void this._gitProvider?.handleRemoveWorktree(message.worktreeId);
  }

  private _handleRenameWorktree(message: WebviewMessage): void {
    if (!message.worktreeId || !message.newName) return;
    void this._gitProvider?.handleRenameWorktree(message.worktreeId, message.newName);
  }

  private _handleRunAction(message: WebviewMessage): void {
    if (!message.worktreeId || !message.actionId) return;
    void this._actionCoordinator?.runAction(message.worktreeId, message.actionId);
  }

  private _handleStopAction(message: WebviewMessage): void {
    if (!message.worktreeId || !message.actionId) return;
    this._actionCoordinator?.stopAction(message.worktreeId, message.actionId);
  }

  private _handleRunPipeline(message: WebviewMessage): void {
    if (!message.worktreeId || !message.pipelineId) return;
    void this._actionCoordinator?.runPipeline(message.worktreeId, message.pipelineId);
  }

  private _handleCancelPipeline(message: WebviewMessage): void {
    if (!message.worktreeId) return;
    this._actionCoordinator?.cancelPipeline(message.worktreeId);
  }

  private _handleGetLog(message: WebviewMessage): void {
    if (!message.worktreeId || !message.actionId) return;
    this._actionCoordinator?.getLog(message.worktreeId, message.actionId);
  }

  private _handleSetPackage(message: WebviewMessage): void {
    if (message.packageName === undefined) return;
    this._saveViewSettings({ selectedPackage: message.packageName });
    void this._actionCoordinator?.setPackage(message.packageName);
  }

  private _handleEnterInspection(message: WebviewMessage): void {
    if (!message.worktreeId) return;
    this._currentInspectedWorktreeId = message.worktreeId;
    const wt = this._gitProvider?.getWorktrees().find((w) => w.id === message.worktreeId);
    if (wt) {
      this._saveViewSettings({ mode: { type: 'inspection', branch: wt.branch } });
    }
    void this.runInsights(message.worktreeId);
    if (wt && this._diagnosticCollector) {
      const files = this._gitProvider?.getWorktreeFiles(message.worktreeId) ?? [];
      this._diagnosticCollector.startInspection(message.worktreeId, wt.path, files);
    }
  }

  private _handleRecheckInsights(message: WebviewMessage): void {
    if (!message.worktreeId) return;
    this._insightRunner?.clearCache(message.worktreeId);
    void this.runInsights(message.worktreeId);
    this._diagnosticCollector?.recheck();
  }

  private _handleExitInspection(): void {
    this._currentInspectedWorktreeId = undefined;
    this._saveViewSettings({ mode: { type: 'grove' } });
    if (this._insightDebounceTimer !== undefined) {
      clearTimeout(this._insightDebounceTimer);
      this._insightDebounceTimer = undefined;
    }
    this._insightAbortController?.abort();
    this._insightAbortController = undefined;
    this._diagnosticCollector?.stopInspection();
  }

  private async onReady(): Promise<void> {
    const postMessage = (msg: object) => {
      void this._panel.webview.postMessage(msg);
    };

    // Reset providers and state
    this._gitProvider?.dispose();
    this._actionCoordinator?.dispose();
    this._iconProvider?.dispose();
    this._settingsChangeDisposable?.dispose();
    this._currentInspectedWorktreeId = undefined;
    this._insightAbortController?.abort();
    this._insightAbortController = undefined;
    if (this._insightDebounceTimer !== undefined) {
      clearTimeout(this._insightDebounceTimer);
      this._insightDebounceTimer = undefined;
    }

    this._insightRunner = new InsightRunner();
    this._diagnosticCollector?.dispose();
    this._diagnosticCollector = new DiagnosticCollector(postMessage);

    this._gitProvider = new GitDataProvider(postMessage, (worktreeId) => {
      // Called by GitDataProvider when files change → stale check states
      this._actionCoordinator?.markAllStale(worktreeId);
      // If currently inspecting this worktree, debounce insight re-analysis
      if (this._currentInspectedWorktreeId === worktreeId) {
        if (this._insightDebounceTimer !== undefined) clearTimeout(this._insightDebounceTimer);
        this._insightDebounceTimer = setTimeout(() => {
          this._insightDebounceTimer = undefined;
          this._insightRunner?.clearCache(worktreeId);
          void this.runInsights(worktreeId);
        }, 2000);
        // Update diagnostics with new file list
        const files = this._gitProvider?.getWorktreeFiles(worktreeId) ?? [];
        this._diagnosticCollector?.updateFiles(files);
      }
    });
    this._actionCoordinator = new ActionCoordinator(postMessage);
    this._iconProvider = new IconThemeProvider();
    this._currentGitRoot = undefined;

    // Watch for icon theme changes
    this._settingsChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('workbench.iconTheme')) {
        void this.reloadIcons();
      }
    });

    // Re-register editor change listener (guards against multiple ready events)
    this._editorChangeDisposable?.dispose();
    this._editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      this.onActiveEditorChange(editor);
    });

    const gitRoot = await this.detectInitialGitRoot();

    if (!gitRoot) {
      const hasSomething =
        vscode.window.activeTextEditor || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      postMessage({
        type: 'error',
        message: hasSomething ? 'No git repository found' : 'Open a file to get started',
      });
      return;
    }

    this._currentGitRoot = gitRoot;
    await this._gitProvider.switchRepo(gitRoot);

    // Apply persisted diff mode overrides before the webview renders
    const viewSettings = this._getViewSettings();
    this._gitProvider.applyDiffModeOverrides(viewSettings.diffModeOverrides);

    // Initialize action coordinator with the repo root
    await this._actionCoordinator.initialize(gitRoot);

    // Let the coordinator know about current worktrees
    this.syncWorktreesToCoordinator();

    // Register MCP tool handlers now that providers are ready
    this.registerMcpHandlers(gitRoot);

    // Restore persisted view mode (inspection/grove) and package selection
    this.restoreViewSettings(viewSettings);

    // Resolve and send file icons (non-blocking)
    void this.reloadIcons();
  }

  /**
   * Send a message to the webview to restore the persisted view state
   * (app mode and selected package) after initialization.
   */
  private restoreViewSettings(settings: PersistedViewSettings): void {
    const worktrees = this._gitProvider?.getWorktrees() ?? [];

    // Resolve persisted inspection mode (branch name → worktree ID)
    let mode: AppMode = { type: 'grove' };
    if (settings.mode.type === 'inspection') {
      const targetBranch = settings.mode.branch;
      const wt = worktrees.find((w) => w.branch === targetBranch);
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

  private syncWorktreesToCoordinator(): void {
    if (!this._gitProvider || !this._actionCoordinator) return;
    const worktrees = this._gitProvider.getWorktrees();
    this._actionCoordinator.updateWorktrees(
      worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch }))
    );
  }

  private async detectInitialGitRoot(): Promise<string | null> {
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

    const fromExtension = this.getGitRootFromVscodeExtension(activeFile);
    if (fromExtension) return fromExtension;

    if (activeFile) {
      const root = await this.resolveGitRoot(activeFile);
      if (root) return root;
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const folderPath = folder.uri.fsPath;
      const cached = this._gitRootCache.get(folderPath);
      const root = cached !== undefined ? cached : await getGitRoot(folderPath);
      if (root) {
        this._gitRootCache.set(folderPath, root);
        return root;
      }
    }

    return null;
  }

  private getGitRootFromVscodeExtension(activeFilePath?: string): string | undefined {
    const gitExt = vscode.extensions.getExtension<{
      getAPI(version: 1): { repositories: Array<{ rootUri: vscode.Uri }> };
    }>('vscode.git');

    if (!gitExt?.isActive) return undefined;

    const repos = gitExt.exports.getAPI(1).repositories;
    if (repos.length === 0) return undefined;

    if (activeFilePath) {
      const match = repos.find((r) => activeFilePath.startsWith(r.rootUri.fsPath));
      if (match) return match.rootUri.fsPath;
    }

    return repos[0]!.rootUri.fsPath;
  }

  private onActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    const filePath = editor?.document.uri.fsPath;
    if (!filePath) return;

    if (this._repoSwitchTimer !== undefined) clearTimeout(this._repoSwitchTimer);
    this._repoSwitchTimer = setTimeout(() => {
      this._repoSwitchTimer = undefined;
      void this.maybeSwitch(filePath);
    }, 250);
  }

  private async maybeSwitch(filePath: string): Promise<void> {
    const gitRoot = await this.resolveGitRoot(filePath);
    if (!gitRoot) return;
    if (gitRoot === this._currentGitRoot) return;
    this._currentGitRoot = gitRoot;
    await this._gitProvider?.switchRepo(gitRoot);
    await this._actionCoordinator?.initialize(gitRoot);
    this.syncWorktreesToCoordinator();
  }

  private async resolveGitRoot(filePath: string): Promise<string | null> {
    const dir = path.dirname(filePath);
    const cached = this._gitRootCache.get(dir);
    if (cached !== undefined) return cached;
    const root = await getGitRoot(dir);
    if (root) this._gitRootCache.set(dir, root);
    return root;
  }

  private async runInsights(worktreeId: string): Promise<void> {
    if (!this._insightRunner || !this._gitProvider || !this._currentGitRoot) return;

    const worktrees = this._gitProvider.getWorktrees();
    const wt = worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;

    // Cancel any in-flight insight run so stale results never overwrite fresh ones
    this._insightAbortController?.abort();
    const controller = new AbortController();
    this._insightAbortController = controller;

    const files = this._gitProvider.getWorktreeFiles(worktreeId);
    const smellRules = this._actionCoordinator?.getSmellRules() ?? [];

    const extraSettings: Record<string, Record<string, unknown>> = {
      codeSmells: { smellRules },
    };

    try {
      const { details } = await this._insightRunner.analyzeWorktree({
        worktreeId,
        files,
        repoRoot: this._currentGitRoot,
        worktreeRoot: wt.path,
        signal: controller.signal,
        extraSettings,
      });

      // If this run was aborted while awaiting, discard the results
      if (controller.signal.aborted) return;

      for (const detail of details) {
        void this._panel.webview.postMessage({ type: 'insight-detail', detail });
      }
    } catch (err) {
      if (controller.signal.aborted) return; // expected cancellation
      log.error('runInsights error:', err);
    }
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

  private dispose() {
    ShiftspacePanel.currentPanel = undefined;

    if (this._repoSwitchTimer !== undefined) {
      clearTimeout(this._repoSwitchTimer);
      this._repoSwitchTimer = undefined;
    }
    if (this._insightDebounceTimer !== undefined) {
      clearTimeout(this._insightDebounceTimer);
      this._insightDebounceTimer = undefined;
    }
    this._insightAbortController?.abort();
    this._insightAbortController = undefined;
    this._editorChangeDisposable?.dispose();
    this._editorChangeDisposable = undefined;
    this._settingsChangeDisposable?.dispose();
    this._settingsChangeDisposable = undefined;

    this._gitProvider?.dispose();
    this._gitProvider = undefined;
    this._actionCoordinator?.dispose();
    this._actionCoordinator = undefined;
    this._iconProvider?.dispose();
    this._iconProvider = undefined;
    this._insightRunner = undefined;
    this._diagnosticCollector?.dispose();
    this._diagnosticCollector = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
