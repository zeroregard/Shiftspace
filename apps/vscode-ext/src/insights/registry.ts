import type { InsightPlugin } from './types';

export class InsightRegistry {
  private plugins: Map<string, InsightPlugin> = new Map();

  register(plugin: InsightPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): InsightPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): InsightPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const insightRegistry = new InsightRegistry();
