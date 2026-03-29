import * as vscode from 'vscode';
import type { InsightConfig } from './types';
import type { InsightRegistry } from './registry';

export function loadInsightConfigs(registry: InsightRegistry): InsightConfig[] {
  const config = vscode.workspace.getConfiguration('shiftspace.insights');
  const plugins = registry.getAll();

  return plugins.map((plugin) => {
    const section = config.get<Record<string, unknown>>(plugin.id) ?? {};

    const enabled = typeof section['enabled'] === 'boolean' ? section['enabled'] : true;

    const settings: Record<string, unknown> = { ...plugin.defaultSettings };
    for (const [key, defaultValue] of Object.entries(plugin.defaultSettings)) {
      const value = section[key];
      if (value !== undefined) {
        settings[key] = value;
      } else {
        settings[key] = defaultValue;
      }
    }

    return {
      id: plugin.id,
      label: plugin.label,
      icon: plugin.icon,
      enabled,
      settings,
    };
  });
}
