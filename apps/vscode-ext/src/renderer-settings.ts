import * as vscode from 'vscode';
import type { WorktreeDiffCountMode, WorktreeVisibility } from '@shiftspace/renderer';
import { DEFAULT_WORKTREE_VISIBILITY, toWorktreeVisibilityMode } from '@shiftspace/renderer';

/** Settings the renderer reads directly, pushed to every webview on open and on change. */
export interface RendererSettings {
  ticketUrlTemplate: string;
  worktreeDiffCount: WorktreeDiffCountMode;
  worktreeVisibility: WorktreeVisibility;
}

const VISIBILITY_KEYS = ['actions', 'githubStatus', 'diffCount', 'timestamp'] as const;

const KEYS = [
  'shiftspace.ticketUrlTemplate',
  'shiftspace.worktreeDiffCount',
  ...VISIBILITY_KEYS.map((k) => `shiftspace.worktree.visibility.${k}`),
];

function readWorktreeVisibility(cfg: vscode.WorkspaceConfiguration): WorktreeVisibility {
  const visibility = { ...DEFAULT_WORKTREE_VISIBILITY };
  for (const key of VISIBILITY_KEYS) {
    visibility[key] = toWorktreeVisibilityMode(
      cfg.get<string>(`worktree.visibility.${key}`),
      DEFAULT_WORKTREE_VISIBILITY[key]
    );
  }
  return visibility;
}

export function readRendererSettings(): RendererSettings {
  const cfg = vscode.workspace.getConfiguration('shiftspace');
  const diffCount = cfg.get<string>('worktreeDiffCount', 'working');
  return {
    ticketUrlTemplate: cfg.get<string>('ticketUrlTemplate', ''),
    worktreeDiffCount: diffCount === 'defaultBranch' ? 'defaultBranch' : 'working',
    worktreeVisibility: readWorktreeVisibility(cfg),
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
