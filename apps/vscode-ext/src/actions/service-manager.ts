import { startService } from './runner';
import type { ServiceHandle } from './runner';
import type { ShiftspaceActionConfig } from './types';
import type { StateManager } from './state-manager';
import type { LogStore } from './log-store';

type PostMessage = (msg: object) => void;

interface RunServiceOpts {
  worktreeId: string;
  actionId: string;
  action: ShiftspaceActionConfig;
  command: string;
  cwd: string;
}

export class ServiceManager {
  private activeServices = new Map<string, ServiceHandle>();

  constructor(
    private readonly stateManager: StateManager,
    private readonly logStore: LogStore,
    private readonly postMessage: PostMessage
  ) {}

  run(opts: RunServiceOpts): void {
    const { worktreeId, actionId, command, cwd } = opts;
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

  /** Stop a service. Returns true if a service was found and stopped. */
  stop(worktreeId: string, actionId: string): boolean {
    const key = `${worktreeId}:${actionId}`;
    const service = this.activeServices.get(key);
    if (!service) return false;

    service.stop();
    this.activeServices.delete(key);
    this.stateManager.set(worktreeId, actionId, { type: 'service', status: 'stopped' });
    return true;
  }

  stopAll(): void {
    for (const [, handle] of this.activeServices) {
      handle.stop();
    }
    this.activeServices.clear();
  }
}
