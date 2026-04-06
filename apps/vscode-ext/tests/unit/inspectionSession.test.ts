import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InspectionSession } from '../../src/insights/InspectionSession';
import type { InspectionDeps } from '../../src/insights/InspectionSession';

const DUMMY_FILE = {
  path: 'src/index.ts',
  status: 'modified' as const,
  staged: false,
  linesAdded: 5,
  linesRemoved: 2,
  lastChangedAt: Date.now(),
};

function makeDeps(overrides?: Partial<InspectionDeps>): InspectionDeps {
  return {
    postMessage: vi.fn(),
    getWorktrees: () => [{ id: 'wt-1', path: '/repo', branch: 'main' }],
    getWorktreeFiles: () => [DUMMY_FILE],
    getCurrentGitRoot: () => '/repo',
    getSmellRules: () => [],
    ...overrides,
  };
}

function makeInsightRunner(result = { summaries: [], details: [] }) {
  return {
    analyzeWorktree: vi.fn(async () => result),
    clearCache: vi.fn(),
    hasCacheEntry: vi.fn(() => false),
  };
}

function makeDiagnosticCollector() {
  return {
    startInspection: vi.fn(),
    stopInspection: vi.fn(),
    updateFiles: vi.fn(),
    recheck: vi.fn(),
    dispose: vi.fn(),
    isEnabled: vi.fn(() => true),
  };
}

describe('InspectionSession — enter / exit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets currentWorktreeId on enter', () => {
    const session = new InspectionSession(
      makeInsightRunner() as never,
      makeDiagnosticCollector() as never,
      makeDeps()
    );

    expect(session.currentWorktreeId).toBeUndefined();
    session.enter('wt-1');
    expect(session.currentWorktreeId).toBe('wt-1');
  });

  it('clears currentWorktreeId on exit', () => {
    const session = new InspectionSession(
      makeInsightRunner() as never,
      makeDiagnosticCollector() as never,
      makeDeps()
    );

    session.enter('wt-1');
    session.exit();
    expect(session.currentWorktreeId).toBeUndefined();
  });

  it('calls diagnosticCollector.startInspection on enter', () => {
    const collector = makeDiagnosticCollector();
    const session = new InspectionSession(
      makeInsightRunner() as never,
      collector as never,
      makeDeps()
    );

    session.enter('wt-1');
    expect(collector.startInspection).toHaveBeenCalledWith('wt-1', '/repo', [DUMMY_FILE]);
  });

  it('does not call startInspection if worktree not found', () => {
    const collector = makeDiagnosticCollector();
    const session = new InspectionSession(
      makeInsightRunner() as never,
      collector as never,
      makeDeps({ getWorktrees: () => [] })
    );

    session.enter('wt-missing');
    expect(collector.startInspection).not.toHaveBeenCalled();
  });

  it('calls diagnosticCollector.stopInspection on exit', () => {
    const collector = makeDiagnosticCollector();
    const session = new InspectionSession(
      makeInsightRunner() as never,
      collector as never,
      makeDeps()
    );

    session.enter('wt-1');
    session.exit();
    expect(collector.stopInspection).toHaveBeenCalled();
  });
});

describe('InspectionSession — insights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears cache on enter', () => {
    const runner = makeInsightRunner();
    const session = new InspectionSession(
      runner as never,
      makeDiagnosticCollector() as never,
      makeDeps()
    );

    session.enter('wt-1');
    expect(runner.clearCache).toHaveBeenCalledWith('wt-1');
  });

  it('posts insights-status running/done around analysis', async () => {
    const runner = makeInsightRunner({ summaries: [], details: [] });
    const postMessage = vi.fn();
    const session = new InspectionSession(runner as never, makeDiagnosticCollector() as never, {
      ...makeDeps(),
      postMessage,
    });

    session.enter('wt-1');
    await vi.runAllTimersAsync();

    const statusCalls = postMessage.mock.calls
      .map(([msg]: [{ type: string }]) => msg)
      .filter((msg: { type: string }) => msg.type === 'insights-status');
    expect(statusCalls).toEqual([
      { type: 'insights-status', running: true },
      { type: 'insights-status', running: false },
    ]);
  });

  it('runs insights on enter', async () => {
    const runner = makeInsightRunner({
      summaries: [],
      details: [{ insightId: 'test', worktreeId: 'wt-1', files: [] }],
    });
    const postMessage = vi.fn();
    const session = new InspectionSession(runner as never, makeDiagnosticCollector() as never, {
      ...makeDeps(),
      postMessage,
    });

    session.enter('wt-1');
    await vi.runAllTimersAsync();

    expect(runner.analyzeWorktree).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'insight-detail',
      detail: { insightId: 'test', worktreeId: 'wt-1', files: [] },
    });
  });

  it('does not run insights if no git root', async () => {
    const runner = makeInsightRunner();
    const session = new InspectionSession(runner as never, makeDiagnosticCollector() as never, {
      ...makeDeps(),
      getCurrentGitRoot: () => undefined,
    });

    session.enter('wt-1');
    await vi.runAllTimersAsync();

    expect(runner.analyzeWorktree).not.toHaveBeenCalled();
  });

  it('recheck clears cache and re-runs insights', async () => {
    const runner = makeInsightRunner();
    const collector = makeDiagnosticCollector();
    const session = new InspectionSession(runner as never, collector as never, makeDeps());

    session.enter('wt-1');
    await vi.runAllTimersAsync();
    runner.analyzeWorktree.mockClear();

    session.recheck('wt-1');
    await vi.runAllTimersAsync();

    expect(runner.clearCache).toHaveBeenCalledWith('wt-1');
    expect(runner.analyzeWorktree).toHaveBeenCalled();
    expect(collector.recheck).toHaveBeenCalled();
  });

  it('aborts in-flight insight run when rechecking', async () => {
    let callCount = 0;
    const runner = {
      analyzeWorktree: vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
        callCount++;
        if (callCount === 1) {
          await new Promise((r) => setTimeout(r, 5000));
          if (signal?.aborted) return { summaries: [], details: [] };
        }
        return {
          summaries: [],
          details: [{ insightId: 'fresh', worktreeId: 'wt-1', files: [] }],
        };
      }),
      clearCache: vi.fn(),
      hasCacheEntry: vi.fn(() => false),
    };
    const postMessage = vi.fn();
    const session = new InspectionSession(runner as never, makeDiagnosticCollector() as never, {
      ...makeDeps(),
      postMessage,
    });

    session.enter('wt-1');
    session.recheck('wt-1');
    await vi.runAllTimersAsync();

    const insightMessages = postMessage.mock.calls.filter(
      ([msg]: [{ type: string }]) => msg.type === 'insight-detail'
    );
    expect(insightMessages).toHaveLength(1);
    expect(insightMessages[0][0].detail.insightId).toBe('fresh');
  });

  it('handles analyzeWorktree throwing an error gracefully', async () => {
    const runner = {
      analyzeWorktree: vi.fn(async () => {
        throw new Error('analysis failed');
      }),
      clearCache: vi.fn(),
      hasCacheEntry: vi.fn(() => false),
    };
    const session = new InspectionSession(
      runner as never,
      makeDiagnosticCollector() as never,
      makeDeps()
    );

    session.enter('wt-1');
    await vi.runAllTimersAsync();

    expect(runner.analyzeWorktree).toHaveBeenCalled();
  });
});

describe('InspectionSession — onFileChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is ignored for a different worktree', () => {
    const runner = makeInsightRunner();
    const session = new InspectionSession(
      runner as never,
      makeDiagnosticCollector() as never,
      makeDeps()
    );

    session.enter('wt-1');
    session.onFileChange('wt-other');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('debounces insight re-run for the active worktree', async () => {
    const runner = makeInsightRunner();
    const session = new InspectionSession(
      runner as never,
      makeDiagnosticCollector() as never,
      makeDeps()
    );

    session.enter('wt-1');
    await vi.runAllTimersAsync();
    runner.analyzeWorktree.mockClear();
    runner.clearCache.mockClear();
    // Simulate no cache entry so onFileChange schedules an insight re-run
    runner.hasCacheEntry.mockReturnValue(false);

    session.onFileChange('wt-1');

    await vi.advanceTimersByTimeAsync(2000);
    expect(runner.analyzeWorktree).toHaveBeenCalled();
  });

  it('debounces diagnostic re-collection', async () => {
    const collector = makeDiagnosticCollector();
    const runner = makeInsightRunner();
    // hasCacheEntry returns true so only the diagnostic debounce fires
    runner.hasCacheEntry.mockReturnValue(true);
    const session = new InspectionSession(runner as never, collector as never, makeDeps());

    session.enter('wt-1');
    await vi.runAllTimersAsync();
    collector.updateFiles.mockClear();

    session.onFileChange('wt-1');
    await vi.advanceTimersByTimeAsync(300);

    expect(collector.updateFiles).toHaveBeenCalled();
  });
});

describe('InspectionSession — dispose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears timers and state', async () => {
    const session = new InspectionSession(
      makeInsightRunner() as never,
      makeDiagnosticCollector() as never,
      makeDeps()
    );

    session.enter('wt-1');
    session.onFileChange('wt-1');
    session.dispose();

    expect(session.currentWorktreeId).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
