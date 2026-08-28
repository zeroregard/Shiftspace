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

const { computeBaseDiff, refreshBaseDiff, getWorktreeDiffCountMode } =
  await import('../../src/git-data-provider/base-diff');

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

describe('computeBaseDiff', () => {
  it('totals the branch diff against the default branch', async () => {
    expect(await computeBaseDiff(makeWt())).toEqual({
      base: 'main',
      fileCount: 2,
      linesAdded: 930,
      linesRemoved: 405,
    });
    expect(getBranchDiffStats).toHaveBeenCalledWith('/repo/feature', 'main');
  });

  it('leaves out files hidden by the ignore patterns', async () => {
    mockConfig({ worktreeDiffCount: 'defaultBranch', ignorePatterns: ['*.yaml'] });
    expect(await computeBaseDiff(makeWt())).toEqual({
      base: 'main',
      fileCount: 1,
      linesAdded: 30,
      linesRemoved: 5,
    });
  });

  it('runs no git command when the counter shows working changes', async () => {
    mockConfig({ worktreeDiffCount: 'working' });
    expect(await computeBaseDiff(makeWt())).toBeUndefined();
    expect(getBranchDiffStats).not.toHaveBeenCalled();
  });

  it('measures against an open PR base instead of the default branch', async () => {
    const wt = makeWt({
      prStatus: {
        number: 7,
        url: 'u',
        state: 'open',
        baseRef: 'stack/part-2',
        conflicts: false,
        approved: false,
        ciStatus: 'none',
        fetchedAt: 0,
      },
    });
    expect(await computeBaseDiff(wt)).toMatchObject({ base: 'stack/part-2' });
    expect(getBranchDiffStats).toHaveBeenCalledWith('/repo/feature', 'stack/part-2');
  });

  it('skips a worktree already sitting on its base branch', async () => {
    expect(await computeBaseDiff(makeWt({ branch: 'main' }))).toBeUndefined();
    expect(getBranchDiffStats).not.toHaveBeenCalled();
  });

  it('reports nothing when there is no merge base (shallow clone), instead of garbage', async () => {
    getBranchDiffStats.mockResolvedValue(null);
    expect(await computeBaseDiff(makeWt())).toBeUndefined();
  });

  it('reports nothing when git fails', async () => {
    getBranchDiffStats.mockRejectedValue(new Error('not a git repository'));
    expect(await computeBaseDiff(makeWt())).toBeUndefined();
  });
});

describe('refreshBaseDiff', () => {
  function makeHost(worktrees: WorktreeState[]) {
    const posted: unknown[] = [];
    return { host: { worktrees, postMessage: (m: unknown) => posted.push(m) }, posted };
  }

  it('stores the stats and tells the views once', async () => {
    const wt = makeWt();
    const { host, posted } = makeHost([wt]);
    await refreshBaseDiff(host as never, wt);
    expect(wt.baseDiff).toEqual({
      base: 'main',
      fileCount: 2,
      linesAdded: 930,
      linesRemoved: 405,
    });
    expect(posted).toEqual([
      {
        type: 'event',
        event: {
          type: 'base-diff-updated',
          worktreeId: 'wt-1',
          diff: { base: 'main', fileCount: 2, linesAdded: 930, linesRemoved: 405 },
        },
      },
    ]);

    // Same numbers on the next pass → no redundant message.
    await refreshBaseDiff(host as never, wt);
    expect(posted).toHaveLength(1);
  });

  it('keeps the previous counts when git fails', async () => {
    const wt = makeWt({
      baseDiff: { base: 'main', fileCount: 3, linesAdded: 10, linesRemoved: 1 },
    });
    const { host, posted } = makeHost([wt]);
    getBranchDiffStats.mockRejectedValue(new Error('index.lock exists'));
    await refreshBaseDiff(host as never, wt);
    expect(wt.baseDiff).toEqual({ base: 'main', fileCount: 3, linesAdded: 10, linesRemoved: 1 });
    expect(posted).toHaveLength(0);
  });

  it('clears previous counts once the diff becomes unmeasurable, so garbage self-heals', async () => {
    const wt = makeWt({
      baseDiff: { base: 'main', fileCount: 589, linesAdded: 5305, linesRemoved: 9434 },
    });
    const { host, posted } = makeHost([wt]);
    getBranchDiffStats.mockResolvedValue(null);
    await refreshBaseDiff(host as never, wt);
    expect(wt.baseDiff).toBeUndefined();
    expect(posted).toHaveLength(1);
  });

  it('clears stale counts once the counter is switched back to working changes', async () => {
    const wt = makeWt({
      baseDiff: { base: 'main', fileCount: 3, linesAdded: 10, linesRemoved: 1 },
    });
    const { host, posted } = makeHost([wt]);
    mockConfig({ worktreeDiffCount: 'working' });
    await refreshBaseDiff(host as never, wt);
    expect(wt.baseDiff).toBeUndefined();
    expect(posted).toHaveLength(1);
  });
});
