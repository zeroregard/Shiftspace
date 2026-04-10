import { describe, it, expect } from 'vitest';
import { LogStore } from '../../src/actions/log-store';

describe('LogStore', () => {
  it('returns empty string for unknown key', () => {
    const store = new LogStore();
    expect(store.get('wt1', 'fmt')).toBe('');
  });

  it('appends chunks and returns combined content', () => {
    const store = new LogStore();
    store.append('wt1', 'fmt', 'hello ');
    store.append('wt1', 'fmt', 'world');
    expect(store.get('wt1', 'fmt')).toBe('hello world');
  });

  it('different worktree+action keys are independent', () => {
    const store = new LogStore();
    store.append('wt1', 'fmt', 'a');
    store.append('wt1', 'lint', 'b');
    store.append('wt2', 'fmt', 'c');
    expect(store.get('wt1', 'fmt')).toBe('a');
    expect(store.get('wt1', 'lint')).toBe('b');
    expect(store.get('wt2', 'fmt')).toBe('c');
  });

  it('clear removes a single action log', () => {
    const store = new LogStore();
    store.append('wt1', 'fmt', 'data');
    store.clear('wt1', 'fmt');
    expect(store.get('wt1', 'fmt')).toBe('');
  });

  it('clear does not affect other keys', () => {
    const store = new LogStore();
    store.append('wt1', 'fmt', 'a');
    store.append('wt1', 'lint', 'b');
    store.clear('wt1', 'fmt');
    expect(store.get('wt1', 'lint')).toBe('b');
  });

  it('clearWorktree removes all logs for that worktree', () => {
    const store = new LogStore();
    store.append('wt1', 'fmt', 'data1');
    store.append('wt1', 'lint', 'data2');
    store.append('wt2', 'fmt', 'data3');
    store.clearWorktree('wt1');
    expect(store.get('wt1', 'fmt')).toBe('');
    expect(store.get('wt1', 'lint')).toBe('');
    expect(store.get('wt2', 'fmt')).toBe('data3');
  });

  it('truncates log to 1MB when overflow occurs', () => {
    const store = new LogStore();
    const large = 'x'.repeat(900_000);
    store.append('wt1', 'fmt', large);
    store.append('wt1', 'fmt', 'y'.repeat(200_000));
    const log = store.get('wt1', 'fmt');
    expect(log.length).toBeLessThanOrEqual(1_000_000);
    expect(log.endsWith('y')).toBe(true);
  });
});
