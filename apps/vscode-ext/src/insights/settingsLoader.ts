import * as vscode from 'vscode';

/**
 * Returns whether an insight plugin is enabled in VSCode settings.
 * Reads `shiftspace.insights.{pluginId}.enabled` (default: true).
 */
export function isInsightEnabled(pluginId: string): boolean {
  const config = vscode.workspace.getConfiguration('shiftspace');
  return config.get<boolean>(`insights.${pluginId}.enabled`) ?? true;
}

/**
 * Reads VSCode settings for an insight plugin and merges with defaults.
 * Reads all keys under `shiftspace.insights.{pluginId}.*`.
 * Falls back to each key in `defaults` when the setting is not configured.
 */
export function getInsightSettings(
  pluginId: string,
  defaults: Record<string, unknown>
): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration('shiftspace');
  const settings: Record<string, unknown> = { ...defaults };
  settings.enabled = config.get<boolean>(`insights.${pluginId}.enabled`) ?? true;
  return settings;
}
