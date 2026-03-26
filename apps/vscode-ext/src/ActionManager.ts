import * as vscode from 'vscode';
import { exec } from 'child_process';
import type { ActionConfig } from '@shiftspace/renderer';

/** Full action config stored in VSCode settings (includes the shell command). */
export interface ExtensionActionConfig extends ActionConfig {
  command: string;
}

interface WorktreeInfo {
  id: string;
  path: string;
  branch: string;
}

/** Manages action button terminals and state for all worktrees. */
export class ActionManager {
  private terminals = new Map<string, vscode.Terminal>(); // `${worktreeId}:${actionId}`
  private terminalCloseDisposables = new Map<string, vscode.Disposable>();
  private configs: ExtensionActionConfig[] = [];
  private worktrees = new Map<string, WorktreeInfo>(); // worktreeId → info
  private postMessage: (msg: object) => void;

  constructor(postMessage: (msg: object) => void) {
    this.postMessage = postMessage;
  }

  updateConfigs(configs: ExtensionActionConfig[]): void {
    this.configs = configs;
  }

  updateWorktrees(worktrees: WorktreeInfo[]): void {
    this.worktrees.clear();
    for (const wt of worktrees) {
      this.worktrees.set(wt.id, wt);
    }
  }

  async runAction(worktreeId: string, actionId: string): Promise<void> {
    const key = `${worktreeId}:${actionId}`;
    const existing = this.terminals.get(key);
    if (existing) {
      existing.show(false);
      return;
    }

    const action = this.configs.find((a) => a.id === actionId);
    const wt = this.worktrees.get(worktreeId);
    if (!action || !wt) return;

    const terminal = vscode.window.createTerminal({
      name: `Shiftspace: ${action.label} (${wt.branch})`,
      cwd: wt.path,
    });
    terminal.show(false);
    terminal.sendText(action.command);
    this.terminals.set(key, terminal);

    this.postMessage({ type: 'action-status', worktreeId, actionId, status: 'running' });

    const closeDisposable = vscode.window.onDidCloseTerminal((closed) => {
      if (closed !== terminal) return;
      closeDisposable.dispose();
      this.terminals.delete(key);
      this.terminalCloseDisposables.delete(key);

      const exitCode = closed.exitStatus?.code;
      if (exitCode !== undefined && exitCode !== 0 && !action.persistent) {
        // One-shot failed: briefly show failed, then revert to idle
        this.postMessage({ type: 'action-status', worktreeId, actionId, status: 'failed' });
        setTimeout(() => {
          this.postMessage({ type: 'action-status', worktreeId, actionId, status: 'idle' });
        }, 2500);
      } else {
        this.postMessage({ type: 'action-status', worktreeId, actionId, status: 'idle' });
      }
    });
    this.terminalCloseDisposables.set(key, closeDisposable);

    if (action.persistent) {
      this.pollForPort(worktreeId, actionId);
    }
  }

  stopAction(worktreeId: string, actionId: string): void {
    const key = `${worktreeId}:${actionId}`;
    const terminal = this.terminals.get(key);
    if (terminal) {
      terminal.dispose();
      this.terminals.delete(key);
    }
    this.terminalCloseDisposables.get(key)?.dispose();
    this.terminalCloseDisposables.delete(key);
    this.postMessage({ type: 'action-status', worktreeId, actionId, status: 'idle' });
  }

  /** Send current configs to the webview. */
  sendConfigs(): void {
    const actions = this.configs.map(({ id, label, icon, persistent }) => ({
      id,
      label,
      icon,
      persistent,
    }));
    this.postMessage({ type: 'actions-config', actions });
  }

  dispose(): void {
    for (const t of this.terminals.values()) t.dispose();
    this.terminals.clear();
    for (const d of this.terminalCloseDisposables.values()) d.dispose();
    this.terminalCloseDisposables.clear();
  }

  // ---------------------------------------------------------------------------
  // Port detection (best-effort, macOS/Linux only)
  // ---------------------------------------------------------------------------

  private pollForPort(worktreeId: string, actionId: string, attempt = 0): void {
    const key = `${worktreeId}:${actionId}`;
    if (attempt >= 5 || !this.terminals.has(key)) return;

    setTimeout(() => {
      if (!this.terminals.has(key)) return;
      exec('lsof -i -P -n -sTCP:LISTEN 2>/dev/null', (err, stdout) => {
        if (err || !stdout) {
          this.pollForPort(worktreeId, actionId, attempt + 1);
          return;
        }
        const port = this.parseFirstListeningPort(stdout);
        if (port) {
          this.postMessage({
            type: 'action-status',
            worktreeId,
            actionId,
            status: 'running',
            port,
          });
        } else {
          this.pollForPort(worktreeId, actionId, attempt + 1);
        }
      });
    }, 2000);
  }

  private parseFirstListeningPort(lsofOutput: string): number | null {
    // Each line: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    // NAME looks like: *:3000 (LISTEN) or 0.0.0.0:3000 (LISTEN)
    for (const line of lsofOutput.split('\n')) {
      const match = line.match(/:(\d+)\s*\(LISTEN\)/);
      if (match) {
        const port = parseInt(match[1]!, 10);
        // Skip well-known system ports
        if (port >= 1024) return port;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Detect Actions command
// ---------------------------------------------------------------------------

const ICON_GUESSES: Array<{ match: RegExp; icon: string; persistent: boolean }> = [
  { match: /^(dev|start|serve|watch)$/, icon: 'play', persistent: true },
  { match: /^(build|compile)$/, icon: 'tools', persistent: false },
  { match: /^(test|spec)$/, icon: 'beaker', persistent: false },
  { match: /^(lint|eslint|oxlint)$/, icon: 'checklist', persistent: false },
  { match: /^(install|ci)$/, icon: 'package', persistent: false },
  { match: /^(typecheck|tsc)$/, icon: 'check', persistent: false },
  { match: /^(format|fmt|prettier)$/, icon: 'whitespace', persistent: false },
  { match: /^(clean|reset)$/, icon: 'trash', persistent: false },
  { match: /^(deploy|publish)$/, icon: 'cloud-upload', persistent: false },
  { match: /^(preview)$/, icon: 'eye', persistent: true },
];

function guessIcon(scriptName: string): { icon: string; persistent: boolean } {
  for (const entry of ICON_GUESSES) {
    if (entry.match.test(scriptName)) {
      return { icon: entry.icon, persistent: entry.persistent };
    }
  }
  return { icon: 'terminal', persistent: false };
}

function detectPackageManager(rootPath: string): string {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) return 'bun run';
  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) return 'yarn';
  return 'npm run';
}

function buildCommand(pkgManager: string, scriptName: string): string {
  if (scriptName === 'install') {
    return pkgManager.replace(' run', '') + ' install';
  }
  return `${pkgManager} ${scriptName}`;
}

export async function runDetectActionsCommand(): Promise<void> {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  // Find repo root: prefer workspace folder
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('Shiftspace: No workspace folder open.');
    return;
  }
  const rootPath = folders[0]!.uri.fsPath;
  const packageJsonPath = path.join(rootPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    vscode.window.showWarningMessage('Shiftspace: No package.json found in workspace root.');
    return;
  }

  let packageJson: { scripts?: Record<string, string> };
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
  } catch {
    vscode.window.showErrorMessage('Shiftspace: Failed to parse package.json.');
    return;
  }

  const scripts = packageJson.scripts ?? {};
  const scriptEntries = Object.entries(scripts);
  if (scriptEntries.length === 0) {
    vscode.window.showInformationMessage('Shiftspace: No scripts found in package.json.');
    return;
  }

  const pkgManager = detectPackageManager(rootPath);

  const items = scriptEntries.map(([name]) => {
    const { icon, persistent } = guessIcon(name);
    const command = buildCommand(pkgManager, name);
    return {
      label: `$(${icon}) ${name}`,
      description: command,
      picked: false,
      action: { id: name, label: name, command, icon, persistent },
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Shiftspace: Select Actions',
    placeHolder: 'Choose scripts to add as action buttons on each worktree',
  });

  if (!selected || selected.length === 0) return;

  const actions = selected.map((s) => s.action);
  const config = vscode.workspace.getConfiguration('shiftspace');
  await config.update('actions', actions, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(
    `Shiftspace: ${actions.length} action${actions.length !== 1 ? 's' : ''} saved.`
  );
}
