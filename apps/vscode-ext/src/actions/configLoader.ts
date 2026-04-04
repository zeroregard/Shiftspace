import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ShiftspaceConfig, ShiftspaceActionConfig } from './types';
import { log } from '../logger';

/** Parse .shiftspace.json content string. Throws on invalid JSON. */
export function parseShiftspaceConfig(content: string): ShiftspaceConfig {
  const parsed = JSON.parse(content) as unknown;
  if (typeof parsed !== 'object' || parsed === null || !('actions' in parsed)) {
    throw new Error('Invalid .shiftspace.json: missing "actions" array');
  }
  return parsed as ShiftspaceConfig;
}

/**
 * Validate smell rules, returning an array of valid rules.
 * Invalid patterns are skipped with a warning; invalid thresholds are corrected.
 */
export function validateSmellRules(rules: unknown[]): import('./types').SmellRule[] {
  const seen = new Set<string>();
  const valid: import('./types').SmellRule[] = [];

  for (const rule of rules) {
    if (typeof rule !== 'object' || rule === null) continue;
    const r = rule as Record<string, unknown>;

    const id = typeof r['id'] === 'string' ? r['id'] : undefined;
    const label = typeof r['label'] === 'string' ? r['label'] : undefined;
    const pattern = typeof r['pattern'] === 'string' ? r['pattern'] : undefined;
    const threshold = typeof r['threshold'] === 'number' ? r['threshold'] : 1;

    if (!id || !label || !pattern) {
      log.warn('Smell rule missing required fields, skipping:', rule);
      continue;
    }
    if (seen.has(id)) {
      log.warn(`Duplicate smell rule id "${id}", skipping`);
      continue;
    }
    if (threshold < 1) {
      log.warn(`Smell rule "${id}" has threshold < 1, defaulting to 1`);
    }

    try {
      new RegExp(pattern);
    } catch {
      log.warn(`Smell rule "${id}" has invalid regex pattern, skipping`);
      continue;
    }

    const fileTypes = Array.isArray(r['fileTypes'])
      ? (r['fileTypes'] as unknown[]).filter((ft): ft is string => typeof ft === 'string')
      : undefined;

    seen.add(id);
    valid.push({ id, label, pattern, threshold: Math.max(1, threshold), fileTypes });
  }

  return valid;
}

/** Validate config, return array of error strings (empty = valid) */
export function validateConfig(config: ShiftspaceConfig): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const action of config.actions) {
    if (ids.has(action.id)) {
      errors.push(`Duplicate action id: "${action.id}"`);
    }
    ids.add(action.id);
    if (!action.id) errors.push('Action missing id');
    if (!action.label) errors.push(`Action "${action.id}" missing label`);
    if (!action.command) errors.push(`Action "${action.id}" missing command`);
    if (action.type !== 'check' && action.type !== 'service') {
      errors.push(`Action "${action.id}" has invalid type: "${String(action.type)}"`);
    }
  }

  if (config.pipelines) {
    for (const [name, pipeline] of Object.entries(config.pipelines)) {
      for (const stepId of pipeline.steps) {
        if (!ids.has(stepId)) {
          errors.push(`Pipeline "${name}" references unknown action id: "${stepId}"`);
        }
      }
    }
  }

  return errors;
}

/**
 * Merge base config actions with override actions.
 * Overrides (personal additionalActions) win on duplicate id.
 */
export function mergeConfigs(
  base: ShiftspaceActionConfig[],
  overrides: ShiftspaceActionConfig[]
): ShiftspaceActionConfig[] {
  const result = new Map<string, ShiftspaceActionConfig>();
  for (const action of base) result.set(action.id, action);
  for (const action of overrides) result.set(action.id, action); // overrides win
  return Array.from(result.values());
}

/** Read and parse .shiftspace.json from the given repo root. Returns null if not found. */
export function readShiftspaceConfigFile(repoRoot: string): ShiftspaceConfig | null {
  const filePath = path.join(repoRoot, '.shiftspace.json');
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return parseShiftspaceConfig(content);
  } catch {
    return null;
  }
}

/** Live ConfigLoader that watches .shiftspace.json and VSCode settings */
export class ConfigLoader implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private _config: ShiftspaceConfig = { actions: [] };
  private _repoRoot: string | undefined;
  private onChange?: (config: ShiftspaceConfig) => void;

  setOnChange(cb: (config: ShiftspaceConfig) => void): void {
    this.onChange = cb;
  }

  get config(): ShiftspaceConfig {
    return this._config;
  }

  async load(repoRoot: string): Promise<ShiftspaceConfig> {
    this._repoRoot = repoRoot;
    this.reload();
    this.setupWatchers(repoRoot);
    return this._config;
  }

  private reload(): void {
    if (!this._repoRoot) return;
    const fileConfig = readShiftspaceConfigFile(this._repoRoot);
    const vsSettings = vscode.workspace.getConfiguration('shiftspace');
    const additionalActions = vsSettings.get<ShiftspaceActionConfig[]>('additionalActions') ?? [];

    const baseActions = fileConfig?.actions ?? [];
    const smells = Array.isArray(fileConfig?.smells)
      ? validateSmellRules(fileConfig.smells as unknown[])
      : [];

    const merged: ShiftspaceConfig = {
      actions: mergeConfigs(baseActions, additionalActions),
      pipelines: fileConfig?.pipelines,
      smells,
    };

    const errors = validateConfig(merged);
    if (errors.length > 0) {
      log.warn('Config validation errors:', errors);
    }

    this._config = merged;
    this.onChange?.(merged);
  }

  private setupWatchers(repoRoot: string): void {
    // Watch .shiftspace.json
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(repoRoot, '.shiftspace.json')
    );
    this.disposables.push(
      fileWatcher,
      fileWatcher.onDidChange(() => this.reload()),
      fileWatcher.onDidCreate(() => this.reload()),
      fileWatcher.onDidDelete(() => this.reload())
    );

    // Watch VSCode settings
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('shiftspace.additionalActions')) {
          this.reload();
        }
      })
    );
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
