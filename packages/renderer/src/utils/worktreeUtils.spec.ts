import { describe, it, expect } from 'vitest';
import { filterCheckoutableBranches } from './worktreeUtils';

describe('filterCheckoutableBranches', () => {
  it('excludes branches already checked out in other worktrees', () => {
    const all = ['main', 'feature/auth', 'fix/login', 'chore/deps'];
    const occupied = ['main', 'feature/auth']; // checked out in other worktrees
    expect(filterCheckoutableBranches(all, occupied)).toEqual(['fix/login', 'chore/deps']);
  });

  it('excludes the current worktree branch when included in occupied list', () => {
    const all = ['main', 'feature/auth', 'fix/login'];
    const occupied = ['feature/auth']; // the current worktree is on feature/auth
    expect(filterCheckoutableBranches(all, occupied)).toEqual(['main', 'fix/login']);
  });

  it('returns all branches when none are occupied', () => {
    const all = ['main', 'feature/x'];
    expect(filterCheckoutableBranches(all, [])).toEqual(['main', 'feature/x']);
  });

  it('returns empty array when all branches are occupied', () => {
    const all = ['main', 'feature/auth'];
    expect(filterCheckoutableBranches(all, ['main', 'feature/auth'])).toEqual([]);
  });

  it('preserves original order', () => {
    const all = ['z-branch', 'a-branch', 'm-branch'];
    const result = filterCheckoutableBranches(all, ['a-branch']);
    expect(result).toEqual(['z-branch', 'm-branch']);
  });

  it('returns empty array when input is empty', () => {
    expect(filterCheckoutableBranches([], ['main'])).toEqual([]);
  });

  it('ignores occupied branches not in the all-branches list', () => {
    const all = ['main', 'feature/x'];
    // 'some-other-branch' is occupied elsewhere but not in our list — no crash
    const result = filterCheckoutableBranches(all, ['some-other-branch']);
    expect(result).toEqual(['main', 'feature/x']);
  });
});
