import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewHtml } from './webview/html';
import { GitDataProvider } from './GitDataProvider';
import { ActionCoordinator } from './actions/ActionCoordinator';
import { getGitRoot } from './git/worktrees';
import { IconThemeProvider } from './IconThemeProvider';
import { InsightRunner } from './insights/runner';
import type { ShiftspaceMcpHttpServer } from './mcp/httpServer';
import { McpToolHandlers } from './mcp/handlers';
import type { WorktreeState } from '@shiftspace/renderer';
import { DiagnosticCollector } from './insights/plugins/diagnostics';
// Register built-in insight plugins (side-effect import)
import './insights/plugins/codeSmells';

export class ShiftspacePanel {
  private static currentPanel: ShiftspacePanel | undefined;
  private static mcpHttpServer: ShiftspaceMcpHttpServer | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _gitProvider: GitDataProvider | undefined;
  private _actionCoordinator: ActionCoordinator | undefined;

  private _iconProvider: IconThemeProvider | undefined;
  private _insightRunner: InsightRunner | undefined;
  private _diagnosticCollector: DiagnosticCollector | undefined;

  static setMcpHttpServer(server: ShiftspaceMcpHttpServer): void {
    ShiftspacePanel.mcpHttpServer = server;
  }

  // Insight state
  private _currentInspectedWorktreeId: string | undefined;
  private _insightDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Workspace-switching state
  private _gitRootCache = new Map<string, string>(); // dir → gitRoot
  private _currentGitRoot: string | undefined;
  private _repoSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  private _editorChangeDisposable: vscode.Disposable | undefined;
  private _settingsChangeDisposable: vscode.Disposable | undefined;

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

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._panel.webview.html = getWebviewHtml(this._panel.webview, context.extensionUri);

    this._panel.webview.onDidReceiveMessage(
      (message: {
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
      }) => {
        if (message.type === 'ready') {
          void this.onReady();
        } else if (message.type === 'file-click') {
          void this._gitProvider?.handleFileClick(message.worktreeId ?? '', message.filePath ?? '');
        } else if (message.type === 'set-diff-mode' && message.worktreeId && message.diffMode) {
          void this._gitProvider?.handleSetDiffMode(
            message.worktreeId,
            message.diffMode as import('@shiftspace/renderer').DiffMode
          );
        } else if (message.type === 'get-branch-list' && message.worktreeId) {
          void this._gitProvider?.handleGetBranchList(message.worktreeId);
        } else if (message.type === 'checkout-branch' && message.worktreeId && message.branch) {
          void this._gitProvider?.handleCheckoutBranch(message.worktreeId, message.branch);
        } else if (message.type === 'folder-click' && message.worktreeId && message.folderPath) {
          void this._gitProvider?.handleFolderClick(message.worktreeId, message.folderPath);
        } else if (message.type === 'fetch-branches' && message.worktreeId) {
          void this._gitProvider?.handleFetchBranches(message.worktreeId);
        } else if (message.type === 'swap-branches' && message.worktreeId) {
          void this._gitProvider?.handleSwapBranches(message.worktreeId);
        } else if (message.type === 'remove-worktree' && message.worktreeId) {
          void this._gitProvider?.handleRemoveWorktree(message.worktreeId);
        } else if (message.type === 'rename-worktree' && message.worktreeId && message.newName) {
          void this._gitProvider?.handleRenameWorktree(message.worktreeId, message.newName);
          // New action coordinator messages
        } else if (message.type === 'run-action' && message.worktreeId && message.actionId) {
          void this._actionCoordinator?.runAction(message.worktreeId, message.actionId);
        } else if (message.type === 'stop-action' && message.worktreeId && message.actionId) {
          this._actionCoordinator?.stopAction(message.worktreeId, message.actionId);
        } else if (message.type === 'run-pipeline' && message.worktreeId && message.pipelineId) {
          void this._actionCoordinator?.runPipeline(message.worktreeId, message.pipelineId);
        } else if (message.type === 'cancel-pipeline' && message.worktreeId) {
          this._actionCoordinator?.cancelPipeline(message.worktreeId);
        } else if (message.type === 'get-log' && message.worktreeId && message.actionId) {
          this._actionCoordinator?.getLog(message.worktreeId, message.actionId);
        } else if (message.type === 'set-package' && message.packageName !== undefined) {
          void this._actionCoordinator?.setPackage(message.packageName);
        } else if (message.type === 'detect-packages') {
          void this._actionCoordinator?.detectAndSendPackages();
        } else if (message.type === 'enter-inspection' && message.worktreeId) {
          this._currentInspectedWorktreeId = message.worktreeId;
          void this.runInsights(message.worktreeId);
          // Start diagnostic collection for this worktree
          const wt = this._gitProvider?.getWorktrees().find((w) => w.id === message.worktreeId);
          if (wt && this._diagnosticCollector) {
            const files = this._gitProvider?.getWorktreeFiles(message.worktreeId!) ?? [];
            this._diagnosticCollector.startInspection(message.worktreeId!, wt.path, files);
          }
        } else if (message.type === 'exit-inspection') {
          this._currentInspectedWorktreeId = undefined;
          if (this._insightDebounceTimer !== undefined) {
            clearTimeout(this._insightDebounceTimer);
            this._insightDebounceTimer = undefined;
          }
          this._diagnosticCollector?.stopInspection();
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
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

    // Initialize action coordinator with the repo root
    await this._actionCoordinator.initialize(gitRoot);

    // Let the coordinator know about current worktrees
    this.syncWorktreesToCoordinator();

    // Register MCP tool handlers now that providers are ready
    this.registerMcpHandlers(gitRoot);

    // Resolve and send file icons (non-blocking)
    void this.reloadIcons();
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

    const files = this._gitProvider.getWorktreeFiles(worktreeId);
    const smellRules = this._actionCoordinator?.getSmellRules() ?? [];

    const extraSettings: Record<string, Record<string, unknown>> = {
      codeSmells: { smellRules },
    };

    try {
      const { details } = await this._insightRunner.analyzeWorktree(
        worktreeId,
        files,
        this._currentGitRoot,
        wt.path,
        undefined,
        extraSettings
      );

      for (const detail of details) {
        void this._panel.webview.postMessage({ type: 'insight-detail', detail });
      }
    } catch (err) {
      console.error('[Shiftspace] runInsights error:', err);
    }
  }

  private registerMcpHandlers(repoRoot: string): void {
    const server = ShiftspacePanel.mcpHttpServer;
    if (!server || !this._gitProvider || !this._actionCoordinator || !this._insightRunner) return;

    const gitProvider = this._gitProvider;
    const coordinator = this._actionCoordinator;
    const insightRunner = this._insightRunner;

    const handlers = new McpToolHandlers({
      worktreeProvider: {
        getWorktrees(): WorktreeState[] {
          const infos = gitProvider.getWorktrees();
          // Build full WorktreeState from the GitDataProvider's internal data
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
      insightRunner,
      repoRoot,
      getPackageName: () => (coordinator['selectedPackage'] as string) ?? '',
      getSmellRules: () => {
        const rules = coordinator.getSmellRules();
        return { codeSmells: { smellRules: rules } };
      },
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
