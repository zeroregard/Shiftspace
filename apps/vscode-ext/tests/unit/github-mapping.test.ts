import { describe, it, expect } from 'vitest';
import {
  mapMergeable,
  mapApproval,
  mapUnresolved,
  mapCiStatus,
  mapToPrStatus,
  type RawReview,
  type RawCheckRun,
} from '../../src/github/client';

describe('mapMergeable', () => {
  it('reports a conflict when mergeable is false or state is dirty', () => {
    expect(mapMergeable({ mergeable: false })).toBe(true);
    expect(mapMergeable({ mergeable: null, mergeable_state: 'dirty' })).toBe(true);
  });

  it('reports clean when mergeable is true', () => {
    expect(mapMergeable({ mergeable: true })).toBe(false);
  });

  it('reports unknown while GitHub is still computing', () => {
    expect(mapMergeable({ mergeable: null })).toBe('unknown');
    expect(mapMergeable({ mergeable: null, mergeable_state: 'unknown' })).toBe('unknown');
  });
});

describe('mapApproval', () => {
  const review = (login: string, state: RawReview['state']): RawReview => ({
    state,
    user: { login },
  });

  it('is approved with a single APPROVED review', () => {
    expect(mapApproval([review('alice', 'APPROVED')])).toBe(true);
  });

  it('is not approved when a reviewer later requests changes', () => {
    expect(mapApproval([review('alice', 'APPROVED'), review('alice', 'CHANGES_REQUESTED')])).toBe(
      false
    );
  });

  it('stays approved when a later review is only a comment', () => {
    expect(mapApproval([review('alice', 'APPROVED'), review('alice', 'COMMENTED')])).toBe(true);
  });

  it('is not approved when another reviewer requests changes', () => {
    expect(mapApproval([review('alice', 'APPROVED'), review('bob', 'CHANGES_REQUESTED')])).toBe(
      false
    );
  });

  it('is not approved with no reviews', () => {
    expect(mapApproval([])).toBe(false);
  });
});

describe('mapUnresolved', () => {
  it('counts only unresolved threads', () => {
    expect(
      mapUnresolved([{ isResolved: false }, { isResolved: true }, { isResolved: false }])
    ).toBe(2);
  });

  it('returns undefined when threads could not be fetched', () => {
    expect(mapUnresolved(null)).toBeUndefined();
  });
});

describe('mapCiStatus', () => {
  const run = (
    status: RawCheckRun['status'],
    conclusion: RawCheckRun['conclusion'] = null
  ): RawCheckRun => ({ status, conclusion });

  it('is none when there are no checks', () => {
    expect(mapCiStatus([])).toBe('none');
  });

  it('is running when any check is not completed', () => {
    expect(mapCiStatus([run('completed', 'success'), run('in_progress')])).toBe('running');
  });

  it('is failing when a completed check failed', () => {
    expect(mapCiStatus([run('completed', 'success'), run('completed', 'failure')])).toBe('failing');
  });

  it('is passing when all completed checks succeeded', () => {
    expect(mapCiStatus([run('completed', 'success'), run('completed', 'skipped')])).toBe('passing');
  });
});

describe('mapToPrStatus', () => {
  it('assembles a full status from all pieces', () => {
    const status = mapToPrStatus({
      number: 7,
      url: 'https://example/pull/7',
      detail: { mergeable: false },
      reviews: [{ state: 'APPROVED', user: { login: 'a' } }],
      threads: [{ isResolved: false }],
      checks: [{ status: 'completed', conclusion: 'success' }],
      now: 123,
    });
    expect(status).toEqual({
      number: 7,
      url: 'https://example/pull/7',
      conflicts: true,
      approved: true,
      unresolvedComments: 1,
      ciStatus: 'passing',
      fetchedAt: 123,
    });
  });
});
