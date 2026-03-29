import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ShiftspaceConfig } from './types';

const ICON_GUESSES: Array<{ match: RegExp; icon: string; type: 'check' | 'service' }> = [
  { match: /^(dev|start|serve|watch)$/, icon: 'play', type: 'service' },
  { match: /^(build|compile)$/, icon: 'tools', type: 'check' },
  { match: /^(test|spec)$/, icon: 'beaker', type: 'check' },
  { match: /^(lint|eslint|oxlint)$/, icon: 'checklist', type: 'check' },
  { match: /^(typecheck|tsc|types)$/, icon: 'check', type: 'check' },
  { match: /^(format|fmt|prettier)$/, icon: 'whitespace', type: 'check' },
  { match: /^(clean|reset)$/, icon: 'trash', type: 'check' },
  { match: /^(deploy|publish)$/, icon: 'cloud-upload', type: 'check' },
  { match: /^(preview)$/, icon: 'eye', type: 'service' },
];

function guessIconAndType(scriptName: string): { icon: string; type: 'check' | 'service' } {
  for (const entry of ICON_GUESSES) {
    if (entry.match.test(scriptName)) {
      return { icon: entry.icon, type: entry.type };
    }
  }
  return { icon: 'terminal', type: 'check' };
}

function detectPackageManager(rootPath: string): string {
  if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) return 'bun run';
  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) return 'yarn';
  return 'npm run';
}

function isMonorepo(rootPath: string): boolean {
  return (
    fs.existsSync(path.join(rootPath, 'turbo.json')) ||
    fs.existsSync(path.join(rootPath, 'pnpm-workspace.yaml')) ||
    (() => {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json'), 'utf8')) as {
          workspaces?: unknown;
        };
        return Array.isArray(pkg.workspaces) || typeof pkg.workspaces === 'object';
      } catch {
        return false;
      }
    })()
  );
}

function buildCommand(pkgManager: string, scriptName: string, monorepo: boolean): string {
  if (monorepo && scriptName !== 'install') {
    // Use turbo filter pattern if turbo is likely available
    return `${pkgManager} ${scriptName} --filter={package}`;
  }
  return `${pkgManager} ${scriptName === 'install' ? '' : scriptName}`.trim();
}

function generateVerifyPipeline(
  actions: Array<{ id: string; type: string }>
): { steps: string[]; stopOnFailure: boolean } | null {
  const checkIds = actions.filter((a) => a.type === 'check').map((a) => a.id);
  if (checkIds.length === 0) return null;
  return { steps: checkIds, stopOnFailure: true };
}

export async function runDetectActionsCommand(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('Shiftspace: No workspace folder open.');
    return;
  }
  const rootPath = folders[0]!.uri.fsPath;

  // Don't overwrite existing .shiftspace.json
  const outputPath = path.join(rootPath, '.shiftspace.json');
  if (fs.existsSync(outputPath)) {
    const answer = await vscode.window.showWarningMessage(
      'Shiftspace: .shiftspace.json already exists. Overwrite?',
      'Overwrite',
      'Cancel'
    );
    if (answer !== 'Overwrite') return;
  }

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
  const monorepo = isMonorepo(rootPath);

  const items = scriptEntries.map(([name]) => {
    const { icon, type } = guessIconAndType(name);
    const command = buildCommand(pkgManager, name, monorepo && type === 'check');
    return {
      label: `$(${icon}) ${name}`,
      description: command,
      picked: type === 'check', // pre-select checks by default
      action: { id: name, label: name, command, icon, type },
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Shiftspace: Select Actions to include in .shiftspace.json',
    placeHolder: 'Choose scripts to add as check/service actions',
  });

  if (!selected || selected.length === 0) return;

  const actions = selected.map((s) => s.action);
  const verifyPipeline = generateVerifyPipeline(actions);

  const config: ShiftspaceConfig = {
    actions,
    pipelines: verifyPipeline ? { verify: verifyPipeline } : undefined,
  };

  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  // Open the generated file in the editor
  const doc = await vscode.workspace.openTextDocument(outputPath);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    `Shiftspace: Generated .shiftspace.json with ${actions.length} action${actions.length !== 1 ? 's' : ''}${verifyPipeline ? ' and a verify pipeline' : ''}.`
  );
}
