import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrStatus, WorktreeState } from '@shiftspace/renderer';

// Shared mutable refs the module mocks read from (hoisted above the imports).
const h = vi.hoisted(() => ({
  token: null as string | null,
  remoteUrl: null as string | null,
  fetchPrStatus: vi.fn(),
}));

vi.mock('../../src/github/auth', () => ({
  getGitHubTokenSilent: () => Promise.resolve(h.token),
}));

vi.mock('../../src/git/git-utils', () => ({
  getRemoteUrl: () => Promise.resolve(h.remoteUrl),
  gitQueue: { isActive: () => false },
}));

vi.mock('../../src/github/client', () => {
  class GitHubApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public rateLimitResetMs?: number
    ) {
      super(message);
    }
  }
  return {
    GitHubApiError,
    isRateLimited: (e: unknown) =>
      e instanceof GitHubApiError && (e.status === 403 || e.status === 429),
    GitHubClient: class {
      fetchPrStatus = h.fetchPrStatus;
    },
  };
});

import { PrStatusPoller, prStatusEqual } from '../../src/git-data-provider/pr-status-poller';
import { GitHubApiError } from '../../src/github/client';

const sampleStatus: PrStatus = {
  number: 1,
  url: 'https://x/pull/1',
  conflicts: false,
  approved: true,
  unresolvedComments: 0,
  ciStatus: 'passing',
  fetchedAt: 100,
};

const worktree = (id: string, branch = 'feat'): WorktreeState =>
  ({ id, path: `/wt/${id}`, branch }) as WorktreeState;

describe('prStatusEqual', () => {
  it('is true for identical statuses (ignoring fetchedAt)', () => {
    expect(prStatusEqual(sampleStatus, { ...sampleStatus, fetchedAt: 999 })).toBe(true);
  });
  it('is true for two undefined', () => {
    expect(prStatusEqual(undefined, undefined)).toBe(true);
  });
  it('is false when one side is undefined', () => {
    expect(prStatusEqual(sampleStatus, undefined)).toBe(false);
  });
  it('is false when a meaningful field differs', () => {
    expect(prStatusEqual(sampleStatus, { ...sampleStatus, ciStatus: 'failing' })).toBe(false);
    expect(prStatusEqual(sampleStatus, { ...sampleStatus, approved: false })).toBe(false);
  });
});

describe('PrStatusPoller.tick', () => {
  let onPrStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    h.token = 'tok';
    h.remoteUrl = 'git@github.com:owner/repo.git';
    h.fetchPrStatus.mockReset();
    onPrStatus = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  function makePoller() {
    return new PrStatusPoller({ getWorktrees: () => [worktree('wt-1')], onPrStatus });
  }

  it('emits the fetched status for a GitHub worktree', async () => {
    h.fetchPrStatus.mockResolvedValue(sampleStatus);
    const poller = makePoller();
    poller.start();
    await vi.waitFor(() => expect(onPrStatus).toHaveBeenCalledWith('wt-1', sampleStatus));
    poller.dispose();
  });

  it('does nothing when there is no GitHub session', async () => {
    h.token = null;
    const poller = makePoller();
    poller.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onPrStatus).not.toHaveBeenCalled();
    poller.dispose();
  });

  it('skips worktrees whose remote is not GitHub', async () => {
    h.remoteUrl = 'git@gitlab.com:owner/repo.git';
    const poller = makePoller();
    poller.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onPrStatus).not.toHaveBeenCalled();
    expect(h.fetchPrStatus).not.toHaveBeenCalled();
    poller.dispose();
  });

  it('emits undefined when the branch has no open PR', async () => {
    h.fetchPrStatus.mockResolvedValue(null);
    const poller = makePoller();
    poller.start();
    await vi.waitFor(() => expect(onPrStatus).toHaveBeenCalledWith('wt-1', undefined));
    poller.dispose();
  });

  it('stops emitting after a rate-limit error', async () => {
    h.fetchPrStatus.mockRejectedValue(new GitHubApiError(403, 'rate limited'));
    const poller = makePoller();
    poller.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onPrStatus).not.toHaveBeenCalled();
    poller.dispose();
  });
});
