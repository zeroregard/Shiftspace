import type { FileChange } from '@shiftspace/renderer';
import type { InsightSummary, InsightDetail } from './types';
import { insightRegistry } from './registry';
import { isInsightEnabled, getInsightSettings } from './settingsLoader';
import { log } from '../logger';

interface CacheEntry {
  files: FileChange[];
  summaries: InsightSummary[];
  details: InsightDetail[];
}

export class InsightRunner {
  private cache = new Map<string, CacheEntry>();

  /**
   * Run all enabled insight plugins for the given worktree.
   * Results are cached per worktree by files reference — pass the same array to
   * get the cached result. The caller (ShiftspacePanel) is responsible for
   * invalidating via `clearCache` when files change.
   *
   * Plugins run in parallel; a failure in one does not abort others.
   */
  async analyzeWorktree(opts: {
    worktreeId: string;
    files: FileChange[];
    repoRoot: string;
    worktreeRoot: string;
    signal?: AbortSignal;
    extraSettings?: Record<string, Record<string, unknown>>;
  }): Promise<{ summaries: InsightSummary[]; details: InsightDetail[] }> {
    const { worktreeId, files, repoRoot, worktreeRoot, signal, extraSettings } = opts;

    const cached = this.cache.get(worktreeId);
    if (cached && cached.files === files) {
      return { summaries: cached.summaries, details: cached.details };
    }

    const plugins = insightRegistry.getAll().filter((p) => isInsightEnabled(p.id));

    const results = await Promise.allSettled(
      plugins.map(async (plugin) => {
        const settings = getInsightSettings(plugin.id, plugin.defaultSettings);
        // Merge any extra (non-VSCode) settings supplied by the caller (e.g. smellRules)
        const extra = extraSettings?.[plugin.id] ?? {};
        const merged = { ...settings, ...extra };

        const { summary, detail } = await plugin.analyze({
          files,
          repoRoot,
          worktreeRoot,
          settings: merged,
          signal,
        });

        // Fill in worktreeId (plugins leave it blank)
        summary.worktreeId = worktreeId;
        detail.worktreeId = worktreeId;

        return { summary, detail };
      })
    );

    const summaries: InsightSummary[] = [];
    const details: InsightDetail[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        summaries.push(result.value.summary);
        details.push(result.value.detail);
      } else {
        log.error('Insight plugin error:', result.reason);
      }
    }

    this.cache.set(worktreeId, { files, summaries, details });
    return { summaries, details };
  }

  clearCache(worktreeId: string): void {
    this.cache.delete(worktreeId);
  }
}
