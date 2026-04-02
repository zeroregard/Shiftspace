import { describe, it, expect } from 'vitest';
import { storeKey, storeKeyWorktreeId, storeKeyPrefix } from './storeKeys';

describe('storeKeys', () => {
  it('storeKey produces a key that storeKeyWorktreeId can extract', () => {
    const key = storeKey('wt-0', 'src/app.ts');
    expect(storeKeyWorktreeId(key)).toBe('wt-0');
  });

  it('storeKeyPrefix matches keys from the same worktree', () => {
    const key = storeKey('wt-1', 'index.ts');
    expect(key.startsWith(storeKeyPrefix('wt-1'))).toBe(true);
    expect(key.startsWith(storeKeyPrefix('wt-0'))).toBe(false);
  });

  it('file paths containing colons do not collide', () => {
    // With the old `:` separator, these would produce the same prefix match
    const keyA = storeKey('wt-0', 'foo:bar.ts');
    const keyB = storeKey('wt-0:foo', 'bar.ts');
    expect(keyA).not.toBe(keyB);
    expect(storeKeyWorktreeId(keyA)).toBe('wt-0');
    expect(storeKeyWorktreeId(keyB)).toBe('wt-0:foo');
  });

  it('keys from different worktrees with same file path are distinct', () => {
    const keyA = storeKey('wt-0', 'shared.ts');
    const keyB = storeKey('wt-1', 'shared.ts');
    expect(keyA).not.toBe(keyB);
  });

  it('storeKeyPrefix does not match a worktree whose id is a prefix of another', () => {
    const key = storeKey('wt-10', 'file.ts');
    // "wt-1" is a prefix of "wt-10" at the string level, but storeKeyPrefix
    // appends the separator so it must NOT match.
    expect(key.startsWith(storeKeyPrefix('wt-1'))).toBe(false);
    expect(key.startsWith(storeKeyPrefix('wt-10'))).toBe(true);
  });
});
