import type { FileChange } from '@shiftspace/renderer';
import type { InsightSummary, InsightDetail } from './types';
import { insightRegistry } from './registry';
import { isInsightEnabled, getInsightSettings } from './settingsLoader';
import { log } from '../logger';

interface CacheEntry {
  /** Content-based key derived from file paths and change metadata. */
  filesCacheKey: string;
  /** Stringified extraSettings for cache invalidation when rules change. */
  extraSettingsKey: string;
  summaries: InsightSummary[];
  details: InsightDetail[];
}

function computeFilesCacheKey(files: FileChange[]): string {
  return files
    .map((f) => `${f.path}:${f.status}:${f.linesAdded}:${f.linesRemoved}:${f.staged}`)
    .sort()
    .join('\n');
}

export class InsightRunner {
  private cache = new Map<string, CacheEntry>();

  /**
   * Run all enabled insight plugins for the given worktree.
   * Results are cached per worktree using a content-based key derived from file
   * paths and change metadata. The caller can force re-analysis via `clearCache`.
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

    const extraSettingsKey = extraSettings ? JSON.stringify(extraSettings) : '';
    const filesCacheKey = computeFilesCacheKey(files);
    const cached = this.cache.get(worktreeId);
    if (
      cached &&
      cached.filesCacheKey === filesCacheKey &&
      cached.extraSettingsKey === extraSettingsKey
    ) {
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

    // If aborted while plugins were running, return empty — don't cache partial results
    if (signal?.aborted) {
      return { summaries: [], details: [] };
    }

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

    this.cache.set(worktreeId, { filesCacheKey, extraSettingsKey, summaries, details });
    return { summaries, details };
  }

  clearCache(worktreeId: string): void {
    this.cache.delete(worktreeId);
  }

  /** Returns true if a cache entry exists for this worktree (may or may not be stale). */
  hasCacheEntry(worktreeId: string): boolean {
    return this.cache.has(worktreeId);
  }
}
