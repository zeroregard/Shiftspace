import { describe, it, expect } from 'vitest';
import type { FileChange, ShiftspaceEvent, WorktreeState } from '../types';
import { applyEventReducer } from './apply-event';

function makeFile(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/index.ts',
    status: 'modified',
    staged: false,
    linesAdded: 1,
    linesRemoved: 0,
    lastChangedAt: 0,
    ...overrides,
  };
}

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/repo',
    branch: 'main',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: true,
    lastActivityAt: 1_000,
    ...overrides,
  };
}

function seed(wt: WorktreeState): Map<string, WorktreeState> {
  return new Map([[wt.id, wt]]);
}

describe('applyEventReducer – lastActivityAt', () => {
  it('bumps lastActivityAt on file-changed to the file timestamp', () => {
    const map = seed(makeWt({ lastActivityAt: 1_000 }));
    const event: ShiftspaceEvent = {
      type: 'file-changed',
      worktreeId: 'wt-1',
      file: makeFile({ lastChangedAt: 5_000 }),
    };
    const next = applyEventReducer(map, event);
    expect(next.get('wt-1')!.lastActivityAt).toBe(5_000);
  });

  it('does not regress lastActivityAt when a file event is older', () => {
    const map = seed(makeWt({ lastActivityAt: 10_000 }));
    const event: ShiftspaceEvent = {
      type: 'file-changed',
      worktreeId: 'wt-1',
      file: makeFile({ lastChangedAt: 1_000 }),
    };
    const next = applyEventReducer(map, event);
    expect(next.get('wt-1')!.lastActivityAt).toBe(10_000);
  });

  it('bumps lastActivityAt on worktree-activity event', () => {
    const map = seed(makeWt({ lastActivityAt: 1_000 }));
    const event: ShiftspaceEvent = {
      type: 'worktree-activity',
      worktreeId: 'wt-1',
      timestamp: 9_000,
    };
    const next = applyEventReducer(map, event);
    expect(next.get('wt-1')!.lastActivityAt).toBe(9_000);
  });

  it('bumps lastActivityAt on file-removed', () => {
    const wt = makeWt({
      lastActivityAt: 1_000,
      files: [makeFile({ path: 'a.ts' })],
    });
    const map = seed(wt);
    const event: ShiftspaceEvent = {
      type: 'file-removed',
      worktreeId: 'wt-1',
      filePath: 'a.ts',
    };
    const next = applyEventReducer(map, event);
    expect(next.get('wt-1')!.lastActivityAt).toBeGreaterThan(1_000);
    expect(next.get('wt-1')!.files).toHaveLength(0);
  });

  it('bumps lastActivityAt on file-staged', () => {
    const wt = makeWt({
      lastActivityAt: 1_000,
      files: [makeFile({ path: 'a.ts', staged: false })],
    });
    const map = seed(wt);
    const event: ShiftspaceEvent = {
      type: 'file-staged',
      worktreeId: 'wt-1',
      filePath: 'a.ts',
    };
    const next = applyEventReducer(map, event);
    expect(next.get('wt-1')!.lastActivityAt).toBeGreaterThan(1_000);
    expect(next.get('wt-1')!.files[0]!.staged).toBe(true);
  });

  it('preserves lastActivityAt on worktree-renamed', () => {
    const wt = makeWt({ id: 'old-id', lastActivityAt: 42_000 });
    const map = seed(wt);
    const renamed: WorktreeState = { ...wt, id: 'new-id', lastActivityAt: 0 };
    const event: ShiftspaceEvent = {
      type: 'worktree-renamed',
      oldWorktreeId: 'old-id',
      worktree: renamed,
    };
    const next = applyEventReducer(map, event);
    expect(next.has('old-id')).toBe(false);
    expect(next.get('new-id')!.lastActivityAt).toBe(42_000);
  });
});
