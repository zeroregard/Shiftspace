import * as vscode from 'vscode';
import { ConfigLoader } from './configLoader';
import { resolveCommand } from './commandResolver';
import { runCheck, startService } from './runner';
import type { ServiceHandle } from './runner';
import { runPipeline } from './pipelineRunner';
import { StateManager } from './stateManager';
import { LogStore } from './logStore';
import { detectPackages } from './packageDetector';
import type {
  ShiftspaceActionConfig,
  CheckState,
  ServiceState,
  SerializedActionState,
} from './types';

type PostMessage = (msg: object) => void;

interface WorktreeInfo {
  id: string;
  path: string;
  branch: string;
}

function serializeState(state: CheckState | ServiceState): SerializedActionState {
  if (state.type === 'check') {
    return { type: 'check', status: state.status, durationMs: state.durationMs };
  }
  return { type: 'service', status: state.status, port: state.port };
}

/**
 * Coordinates action execution for all worktrees.
 * Replaces the old terminal-based ActionManager with background process runners.
 */
export class ActionCoordinator implements vscode.Disposable {
  private configLoader = new ConfigLoader();
  private stateManager = new StateManager();
  private logStore = new LogStore();

  private activeChecks = new Map<string, AbortController>(); // `${worktreeId}:${actionId}`
  private activeServices = new Map<string, ServiceHandle>(); // `${worktreeId}:${actionId}`
  private activePipelines = new Map<string, AbortController>(); // `${worktreeId}`

  private worktrees = new Map<string, WorktreeInfo>(); // worktreeId → info
  private selectedPackage = '';
  private repoRoot: string | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly postMessage: PostMessage) {}

  async initialize(repoRoot: string): Promise<void> {
    this.repoRoot = repoRoot;
    this.selectedPackage =
      vscode.workspace.getConfiguration('shiftspace').get<string>('package') ?? '';

    await this.configLoader.load(repoRoot);

    this.configLoader.setOnChange((_config) => {
      this.sendConfigToWebview();
    });

    // Watch for package setting changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('shiftspace.package')) {
          this.selectedPackage =
            vscode.workspace.getConfiguration('shiftspace').get<string>('package') ?? '';
          this.sendConfigToWebview();
        }
      })
    );

    // Forward state changes to webview
    this.stateManager.onChange((worktreeId, actionId, state) => {
      this.postMessage({
        type: 'action-state-update',
        worktreeId,
        actionId,
        state: serializeState(state),
      });
    });

    this.sendConfigToWebview();
    void this.detectAndSendPackages();
  }

  updateWorktrees(worktrees: WorktreeInfo[]): void {
    this.worktrees.clear();
    for (const wt of worktrees) {
      this.worktrees.set(wt.id, wt);
    }
  }

  /** Called by GitDataProvider when files change — marks check states stale */
  markAllStale(worktreeId: string): void {
    this.stateManager.markAllStale(worktreeId);
    // stateManager.onChange fires for each changed state, no additional work needed
  }

  async runAction(worktreeId: string, actionId: string): Promise<void> {
    const wt = this.worktrees.get(worktreeId);
    if (!wt) return;

    const config = this.configLoader.config;
    const action = config.actions.find((a) => a.id === actionId);
    if (!action) return;

    const resolved = resolveCommand(action.command, this.selectedPackage);
    if (resolved === null) {
      // Mark as unconfigured
      this.stateManager.set(worktreeId, actionId, { type: 'check', status: 'unconfigured' });
      return;
    }

    if (action.type === 'service') {
      this.runService(worktreeId, actionId, action, resolved, wt.path);
    } else {
      await this.runCheckAction(worktreeId, actionId, resolved, wt.path);
    }
  }

  private async runCheckAction(
    worktreeId: string,
    actionId: string,
    command: string,
    cwd: string
  ): Promise<void> {
    // Cancel any in-progress run
    this.activeChecks.get(`${worktreeId}:${actionId}`)?.abort();
    const controller = new AbortController();
    this.activeChecks.set(`${worktreeId}:${actionId}`, controller);

    this.logStore.clear(worktreeId, actionId);
    this.stateManager.set(worktreeId, actionId, {
      type: 'check',
      status: 'running',
      startedAt: Date.now(),
    });

    try {
      const result = await runCheck(command, actionId, {
        cwd,
        signal: controller.signal,
        onStdout: (chunk) => {
          this.logStore.append(worktreeId, actionId, chunk);
          this.postMessage({
            type: 'action-log-chunk',
            worktreeId,
            actionId,
            chunk,
            isStderr: false,
          });
        },
        onStderr: (chunk) => {
          this.logStore.append(worktreeId, actionId, chunk);
          this.postMessage({
            type: 'action-log-chunk',
            worktreeId,
            actionId,
            chunk,
            isStderr: true,
          });
        },
      });

      this.activeChecks.delete(`${worktreeId}:${actionId}`);
      this.stateManager.set(worktreeId, actionId, {
        type: 'check',
        status: result.status,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
      });
    } catch {
      this.activeChecks.delete(`${worktreeId}:${actionId}`);
      if (controller.signal.aborted) {
        // Cancelled — leave state as-is or reset to idle
        return;
      }
      this.stateManager.set(worktreeId, actionId, { type: 'check', status: 'failed' });
    }
  }

  private runService(
    worktreeId: string,
    actionId: string,
    action: ShiftspaceActionConfig,
    command: string,
    cwd: string
  ): void {
    const key = `${worktreeId}:${actionId}`;

    // If already running, do nothing
    if (this.activeServices.has(key)) return;

    this.logStore.clear(worktreeId, actionId);
    this.stateManager.set(worktreeId, actionId, { type: 'service', status: 'running' });

    const handle = startService(command, {
      cwd,
      onStdout: (chunk) => {
        this.logStore.append(worktreeId, actionId, chunk);
        this.postMessage({
          type: 'action-log-chunk',
          worktreeId,
          actionId,
          chunk,
          isStderr: false,
        });
      },
      onStderr: (chunk) => {
        this.logStore.append(worktreeId, actionId, chunk);
        this.postMessage({ type: 'action-log-chunk', worktreeId, actionId, chunk, isStderr: true });
      },
    });

    handle.onPort = (port) => {
      this.stateManager.set(worktreeId, actionId, { type: 'service', status: 'running', port });
    };

    handle.onExit = (code) => {
      this.activeServices.delete(key);
      const status = code === 0 ? 'stopped' : 'failed';
      this.stateManager.set(worktreeId, actionId, { type: 'service', status });
    };

    this.activeServices.set(key, handle);
  }

  stopAction(worktreeId: string, actionId: string): void {
    const key = `${worktreeId}:${actionId}`;

    // Stop service
    const service = this.activeServices.get(key);
    if (service) {
      service.stop();
      this.activeServices.delete(key);
      this.stateManager.set(worktreeId, actionId, { type: 'service', status: 'stopped' });
      return;
    }

    // Cancel check
    this.activeChecks.get(key)?.abort();
    this.activeChecks.delete(key);
    this.stateManager.set(worktreeId, actionId, { type: 'check', status: 'idle' });
  }

  async runPipeline(worktreeId: string, pipelineId: string): Promise<void> {
    const wt = this.worktrees.get(worktreeId);
    if (!wt) return;

    const config = this.configLoader.config;
    const pipeline = config.pipelines?.[pipelineId];
    if (!pipeline) return;

    // Cancel any in-progress pipeline for this worktree
    this.activePipelines.get(worktreeId)?.abort();
    const controller = new AbortController();
    this.activePipelines.set(worktreeId, controller);

    // Build actions map with resolved commands
    const actionsMap = new Map<string, ShiftspaceActionConfig>();
    for (const action of config.actions) {
      const resolved = resolveCommand(action.command, this.selectedPackage);
      if (resolved !== null) {
        actionsMap.set(action.id, { ...action, command: resolved });
      }
    }

    await runPipeline(pipeline, actionsMap, {
      cwd: wt.path,
      signal: controller.signal,
      onStepStart: (actionId) => {
        this.logStore.clear(worktreeId, actionId);
        this.stateManager.set(worktreeId, actionId, {
          type: 'check',
          status: 'running',
          startedAt: Date.now(),
        });
      },
      onStepComplete: (result) => {
        this.stateManager.set(worktreeId, result.actionId, {
          type: 'check',
          status: result.status,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
        });
      },
      onStdout: (actionId, chunk) => {
        this.logStore.append(worktreeId, actionId, chunk);
        this.postMessage({
          type: 'action-log-chunk',
          worktreeId,
          actionId,
          chunk,
          isStderr: false,
        });
      },
      onStderr: (actionId, chunk) => {
        this.logStore.append(worktreeId, actionId, chunk);
        this.postMessage({ type: 'action-log-chunk', worktreeId, actionId, chunk, isStderr: true });
      },
    });

    this.activePipelines.delete(worktreeId);
  }

  cancelPipeline(worktreeId: string): void {
    this.activePipelines.get(worktreeId)?.abort();
    this.activePipelines.delete(worktreeId);
  }

  getLog(worktreeId: string, actionId: string): void {
    const content = this.logStore.get(worktreeId, actionId);
    this.postMessage({ type: 'action-log', worktreeId, actionId, content });
  }

  async setPackage(packageName: string): Promise<void> {
    this.selectedPackage = packageName;
    await vscode.workspace
      .getConfiguration('shiftspace')
      .update('package', packageName, vscode.ConfigurationTarget.Workspace);
    this.sendConfigToWebview();
  }

  async detectAndSendPackages(): Promise<void> {
    if (!this.repoRoot) return;
    const packages = await detectPackages(this.repoRoot);
    this.postMessage({ type: 'packages-list', packages });
  }

  /** Send full config + initial states to the webview */
  sendConfigToWebview(): void {
    const config = this.configLoader.config;
    this.postMessage({
      type: 'actions-config-v2',
      actions: config.actions.map((a) => ({
        id: a.id,
        label: a.label,
        type: a.type,
        icon: a.icon,
      })),
      pipelines: config.pipelines,
      selectedPackage: this.selectedPackage,
    });
  }

  /** Send all current action states for all worktrees */
  sendAllStates(): void {
    for (const [worktreeId] of this.worktrees) {
      const states = this.stateManager.getWorktreeStates(worktreeId);
      for (const [actionId, state] of states) {
        this.postMessage({
          type: 'action-state-update',
          worktreeId,
          actionId,
          state: serializeState(state),
        });
      }
    }
  }

  dispose(): void {
    // Stop all services
    for (const [, handle] of this.activeServices) {
      handle.stop();
    }
    this.activeServices.clear();

    // Cancel all checks
    for (const [, controller] of this.activeChecks) {
      controller.abort();
    }
    this.activeChecks.clear();

    // Cancel all pipelines
    for (const [, controller] of this.activePipelines) {
      controller.abort();
    }
    this.activePipelines.clear();

    this.configLoader.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
