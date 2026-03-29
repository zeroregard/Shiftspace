import type { FileChange } from '@shiftspace/renderer';
import type { InsightConfig, InsightSummary, InsightDetail } from './types';
import type { InsightRegistry } from './registry';

interface CacheEntry {
  fileKey: string;
  summaries: InsightSummary[];
  details: InsightDetail[];
}

export class InsightRunner {
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    private registry: InsightRegistry,
    private configProvider: () => InsightConfig[]
  ) {}

  async analyzeWorktree(
    worktreeId: string,
    files: FileChange[],
    repoRoot: string,
    worktreeRoot: string,
    signal?: AbortSignal
  ): Promise<{ summaries: InsightSummary[]; details: InsightDetail[] }> {
    const fileKey = this.computeFileKey(files);
    const cached = this.cache.get(worktreeId);
    if (cached && cached.fileKey === fileKey) {
      return { summaries: cached.summaries, details: cached.details };
    }

    const configs = this.configProvider();
    const enabledConfigs = configs.filter((c) => c.enabled);

    const results = await Promise.allSettled(
      enabledConfigs.map(async (config) => {
        const plugin = this.registry.get(config.id);
        if (!plugin) return null;
        const result = await plugin.analyze(files, repoRoot, worktreeRoot, config.settings, signal);
        return {
          summary: { ...result.summary, worktreeId },
          detail: { ...result.detail, worktreeId },
        };
      })
    );

    const summaries: InsightSummary[] = [];
    const details: InsightDetail[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        summaries.push(result.value.summary);
        details.push(result.value.detail);
      }
    }

    this.cache.set(worktreeId, { fileKey, summaries, details });
    return { summaries, details };
  }

  invalidate(worktreeId: string): void {
    this.cache.delete(worktreeId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private computeFileKey(files: FileChange[]): string {
    return files
      .map((f) => `${f.path}:${f.status}:${f.linesAdded}:${f.linesRemoved}:${f.staged}`)
      .sort()
      .join('|');
  }
}
