import type { InsightPlugin } from './types';

class InsightRegistry {
  private plugins = new Map<string, InsightPlugin>();

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
export { InsightRegistry };
