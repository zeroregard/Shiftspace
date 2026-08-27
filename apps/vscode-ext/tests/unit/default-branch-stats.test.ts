import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import type { WorktreeState } from '@shiftspace/renderer';

const getBranchDiffStats = vi.fn();

vi.mock('../../src/git/branch-stats', async () => {
  const actual = await vi.importActual<typeof import('../../src/git/branch-stats')>(
    '../../src/git/branch-stats'
  );
  return { ...actual, getBranchDiffStats: (...args: unknown[]) => getBranchDiffStats(...args) };
});

const { computeDefaultBranchStats, refreshDefaultBranchStats, getWorktreeDiffCountMode } =
  await import('../../src/git-data-provider/default-branch-stats');

function mockConfig(settings: Record<string, unknown>): void {
  (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
    get: vi.fn((key: string, fallback: unknown) => settings[key] ?? fallback),
  }));
}

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/repo/feature',
    branch: 'feature/auth',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  getBranchDiffStats.mockReset();
  getBranchDiffStats.mockResolvedValue(
    new Map([
      ['src/app.ts', { added: 30, removed: 5 }],
      ['pnpm-lock.yaml', { added: 900, removed: 400 }],
    ])
  );
  mockConfig({ worktreeDiffCount: 'defaultBranch', ignorePatterns: [] });
});

describe('getWorktreeDiffCountMode', () => {
  it('defaults to working changes', () => {
    mockConfig({});
    expect(getWorktreeDiffCountMode()).toBe('working');
  });

  it('falls back to working changes for an unrecognized value', () => {
    mockConfig({ worktreeDiffCount: 'nonsense' });
    expect(getWorktreeDiffCountMode()).toBe('working');
  });
});

describe('computeDefaultBranchStats', () => {
  it('totals the branch diff against the default branch', async () => {
    expect(await computeDefaultBranchStats(makeWt())).toEqual({
      fileCount: 2,
      linesAdded: 930,
      linesRemoved: 405,
    });
    expect(getBranchDiffStats).toHaveBeenCalledWith('/repo/feature', 'main');
  });

  it('leaves out files hidden by the ignore patterns', async () => {
    mockConfig({ worktreeDiffCount: 'defaultBranch', ignorePatterns: ['*.yaml'] });
    expect(await computeDefaultBranchStats(makeWt())).toEqual({
      fileCount: 1,
      linesAdded: 30,
      linesRemoved: 5,
    });
  });

  it('runs no git command when the counter shows working changes', async () => {
    mockConfig({ worktreeDiffCount: 'working' });
    expect(await computeDefaultBranchStats(makeWt())).toBeUndefined();
    expect(getBranchDiffStats).not.toHaveBeenCalled();
  });

  it('skips a worktree already on the default branch', async () => {
    expect(await computeDefaultBranchStats(makeWt({ branch: 'main' }))).toBeUndefined();
    expect(getBranchDiffStats).not.toHaveBeenCalled();
  });

  it('reports nothing when git fails', async () => {
    getBranchDiffStats.mockRejectedValue(new Error('not a git repository'));
    expect(await computeDefaultBranchStats(makeWt())).toBeUndefined();
  });
});

describe('refreshDefaultBranchStats', () => {
  function makeHost(worktrees: WorktreeState[]) {
    const posted: unknown[] = [];
    return { host: { worktrees, postMessage: (m: unknown) => posted.push(m) }, posted };
  }

  it('stores the stats and tells the views once', async () => {
    const wt = makeWt();
    const { host, posted } = makeHost([wt]);
    await refreshDefaultBranchStats(host as never, wt);
    expect(wt.defaultBranchStats).toEqual({ fileCount: 2, linesAdded: 930, linesRemoved: 405 });
    expect(posted).toEqual([
      {
        type: 'event',
        event: {
          type: 'default-branch-stats-updated',
          worktreeId: 'wt-1',
          stats: { fileCount: 2, linesAdded: 930, linesRemoved: 405 },
        },
      },
    ]);

    // Same numbers on the next pass → no redundant message.
    await refreshDefaultBranchStats(host as never, wt);
    expect(posted).toHaveLength(1);
  });

  it('keeps the previous counts when git fails', async () => {
    const wt = makeWt({ defaultBranchStats: { fileCount: 3, linesAdded: 10, linesRemoved: 1 } });
    const { host, posted } = makeHost([wt]);
    getBranchDiffStats.mockRejectedValue(new Error('index.lock exists'));
    await refreshDefaultBranchStats(host as never, wt);
    expect(wt.defaultBranchStats).toEqual({ fileCount: 3, linesAdded: 10, linesRemoved: 1 });
    expect(posted).toHaveLength(0);
  });

  it('clears stale counts once the counter is switched back to working changes', async () => {
    const wt = makeWt({ defaultBranchStats: { fileCount: 3, linesAdded: 10, linesRemoved: 1 } });
    const { host, posted } = makeHost([wt]);
    mockConfig({ worktreeDiffCount: 'working' });
    await refreshDefaultBranchStats(host as never, wt);
    expect(wt.defaultBranchStats).toBeUndefined();
    expect(posted).toHaveLength(1);
  });
});
