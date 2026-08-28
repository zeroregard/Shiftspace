import { describe, it, expect } from 'vitest';
import { getComparisonBase } from './comparison-base';
import type { PrStatus, WorktreeState } from '../types';

function prStatus(overrides: Partial<PrStatus> = {}): PrStatus {
  return {
    number: 7,
    url: 'https://github.com/acme/app/pull/7',
    state: 'open',
    conflicts: false,
    approved: false,
    ciStatus: 'passing',
    fetchedAt: 0,
    ...overrides,
  };
}

function worktree(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/repo/part-3',
    branch: 'stack/part-3',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

describe('getComparisonBase', () => {
  it('uses the default branch when there is no PR', () => {
    expect(getComparisonBase(worktree())).toEqual({ branch: 'main', fromPr: false });
  });

  it('uses an open PR base, so a stacked slice is measured against the slice below it', () => {
    const wt = worktree({ prStatus: prStatus({ baseRef: 'stack/part-2' }) });
    expect(getComparisonBase(wt)).toEqual({ branch: 'stack/part-2', fromPr: true });
  });

  it('falls back to the default branch for a PR status without a base', () => {
    // A status cached before the base was recorded.
    const wt = worktree({ prStatus: prStatus({ baseRef: undefined }) });
    expect(getComparisonBase(wt)).toEqual({ branch: 'main', fromPr: false });
  });

  it('ignores a merged PR, whose base no longer says anything', () => {
    const wt = worktree({ prStatus: prStatus({ state: 'merged', baseRef: 'stack/part-2' }) });
    expect(getComparisonBase(wt)).toEqual({ branch: 'main', fromPr: false });
  });

  it('ignores a base that is the branch itself rather than comparing it to itself', () => {
    const wt = worktree({ prStatus: prStatus({ baseRef: 'stack/part-3' }) });
    expect(getComparisonBase(wt)).toEqual({ branch: 'main', fromPr: false });
  });
});
