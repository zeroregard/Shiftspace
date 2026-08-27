import * as vscode from 'vscode';
import type { WorktreeDiffCountMode } from '@shiftspace/renderer';

/** Settings the renderer reads directly, pushed to every webview on open and on change. */
export interface RendererSettings {
  ticketUrlTemplate: string;
  worktreeDiffCount: WorktreeDiffCountMode;
}

const KEYS = ['shiftspace.ticketUrlTemplate', 'shiftspace.worktreeDiffCount'];

export function readRendererSettings(): RendererSettings {
  const cfg = vscode.workspace.getConfiguration('shiftspace');
  const diffCount = cfg.get<string>('worktreeDiffCount', 'working');
  return {
    ticketUrlTemplate: cfg.get<string>('ticketUrlTemplate', ''),
    worktreeDiffCount: diffCount === 'defaultBranch' ? 'defaultBranch' : 'working',
  };
}

/** True when a configuration change touched any renderer-facing setting. */
export function affectsRendererSettings(e: vscode.ConfigurationChangeEvent): boolean {
  return KEYS.some((key) => e.affectsConfiguration(key));
}

/** The `settings-update` message every webview expects. */
export function rendererSettingsMessage(): RendererSettings & { type: 'settings-update' } {
  return { type: 'settings-update', ...readRendererSettings() };
}
