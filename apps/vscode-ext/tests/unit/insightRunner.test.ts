import { describe, it, expect, vi } from 'vitest';
import { InsightRegistry } from '../../src/insights/registry';
import { InsightRunner } from '../../src/insights/runner';
import type { InsightPlugin, InsightConfig } from '../../src/insights/types';
import type { FileChange } from '@shiftspace/renderer';

function makePlugin(id: string, analyzeFn?: InsightPlugin['analyze']): InsightPlugin {
  return {
    id,
    label: id,
    icon: 'beaker',
    defaultSettings: {},
    analyze:
      analyzeFn ??
      (async () => ({
        summary: {
          insightId: id,
          worktreeId: '',
          score: 1,
          label: `1 ${id}`,
          severity: 'low' as const,
        },
        detail: {
          insightId: id,
          worktreeId: '',
          data: { result: 'ok' },
        },
      })),
  };
}

function makeConfig(id: string, enabled = true): InsightConfig {
  return { id, label: id, icon: 'beaker', enabled, settings: {} };
}

const sampleFiles: FileChange[] = [
  {
    path: 'src/a.ts',
    status: 'modified',
    staged: false,
    linesAdded: 10,
    linesRemoved: 5,
    lastChangedAt: Date.now(),
  },
  {
    path: 'src/b.ts',
    status: 'added',
    staged: true,
    linesAdded: 20,
    linesRemoved: 0,
    lastChangedAt: Date.now(),
  },
];

describe('InsightRunner', () => {
  it('runs only enabled insights', async () => {
    const registry = new InsightRegistry();
    const analyzeFnA = vi.fn(makePlugin('a').analyze);
    const analyzeFnB = vi.fn(makePlugin('b').analyze);
    registry.register(makePlugin('a', analyzeFnA));
    registry.register(makePlugin('b', analyzeFnB));

    const runner = new InsightRunner(registry, () => [
      makeConfig('a', true),
      makeConfig('b', false),
    ]);

    const result = await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]!.insightId).toBe('a');
    expect(analyzeFnA).toHaveBeenCalledOnce();
    expect(analyzeFnB).not.toHaveBeenCalled();
  });

  it('handles errors per-insight without breaking others', async () => {
    const registry = new InsightRegistry();
    registry.register(
      makePlugin('failing', async () => {
        throw new Error('boom');
      })
    );
    registry.register(makePlugin('working'));

    const runner = new InsightRunner(registry, () => [
      makeConfig('failing', true),
      makeConfig('working', true),
    ]);

    const result = await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    // Only 'working' should succeed
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]!.insightId).toBe('working');
  });

  it('caches results and returns from cache on same file set', async () => {
    const registry = new InsightRegistry();
    const analyzeFn = vi.fn(makePlugin('cached').analyze);
    registry.register(makePlugin('cached', analyzeFn));

    const runner = new InsightRunner(registry, () => [makeConfig('cached', true)]);

    await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    expect(analyzeFn).toHaveBeenCalledOnce();
  });

  it('invalidates cache when file set changes', async () => {
    const registry = new InsightRegistry();
    const analyzeFn = vi.fn(makePlugin('inv').analyze);
    registry.register(makePlugin('inv', analyzeFn));

    const runner = new InsightRunner(registry, () => [makeConfig('inv', true)]);

    await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    expect(analyzeFn).toHaveBeenCalledOnce();

    // Change file set
    const newFiles: FileChange[] = [{ ...sampleFiles[0]!, linesAdded: 999 }, sampleFiles[1]!];

    await runner.analyzeWorktree('wt-1', newFiles, '/repo', '/repo');
    expect(analyzeFn).toHaveBeenCalledTimes(2);
  });

  it('invalidate clears cache for worktree', async () => {
    const registry = new InsightRegistry();
    const analyzeFn = vi.fn(makePlugin('clr').analyze);
    registry.register(makePlugin('clr', analyzeFn));

    const runner = new InsightRunner(registry, () => [makeConfig('clr', true)]);

    await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    runner.invalidate('wt-1');
    await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    expect(analyzeFn).toHaveBeenCalledTimes(2);
  });

  it('returns empty results when no insights configured', async () => {
    const registry = new InsightRegistry();
    const runner = new InsightRunner(registry, () => []);

    const result = await runner.analyzeWorktree('wt-1', sampleFiles, '/repo', '/repo');
    expect(result.summaries).toEqual([]);
    expect(result.details).toEqual([]);
  });

  it('sets worktreeId on returned summaries and details', async () => {
    const registry = new InsightRegistry();
    registry.register(makePlugin('wtid'));

    const runner = new InsightRunner(registry, () => [makeConfig('wtid', true)]);

    const result = await runner.analyzeWorktree('wt-42', sampleFiles, '/repo', '/repo');
    expect(result.summaries[0]!.worktreeId).toBe('wt-42');
    expect(result.details[0]!.worktreeId).toBe('wt-42');
  });
});
