import { describe, it, expect, vi } from 'vitest';
import { StateManager } from '../../src/actions/state-manager';
import type { CheckState, ServiceState } from '../../src/actions/types';

describe('StateManager', () => {
  it('returns undefined for unset state', () => {
    const sm = new StateManager();
    expect(sm.get('wt-1', 'fmt')).toBeUndefined();
  });

  it('stores and retrieves state', () => {
    const sm = new StateManager();
    const state: CheckState = { type: 'check', status: 'passed', durationMs: 1000 };
    sm.set('wt-1', 'fmt', state);
    expect(sm.get('wt-1', 'fmt')).toEqual(state);
  });

  it('notifies onChange listener on set', () => {
    const sm = new StateManager();
    const listener = vi.fn();
    sm.onChange(listener);
    const state: CheckState = { type: 'check', status: 'running' };
    sm.set('wt-1', 'fmt', state);
    expect(listener).toHaveBeenCalledWith('wt-1', 'fmt', state);
  });

  it('onChange returns unsubscribe function', () => {
    const sm = new StateManager();
    const listener = vi.fn();
    const unsub = sm.onChange(listener);
    unsub();
    sm.set('wt-1', 'fmt', { type: 'check', status: 'running' });
    expect(listener).not.toHaveBeenCalled();
  });

  describe('markAllStale', () => {
    it('transitions passed check to stale', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'fmt', { type: 'check', status: 'passed', durationMs: 500 });
      sm.markAllStale('wt-1');
      const state = sm.get('wt-1', 'fmt') as CheckState;
      expect(state.status).toBe('stale');
      expect(state.durationMs).toBe(500); // preserves duration
    });

    it('transitions failed check to stale', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'lint', { type: 'check', status: 'failed', exitCode: 1 });
      sm.markAllStale('wt-1');
      expect((sm.get('wt-1', 'lint') as CheckState).status).toBe('stale');
    });

    it('does NOT affect running checks', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'test', { type: 'check', status: 'running' });
      sm.markAllStale('wt-1');
      expect((sm.get('wt-1', 'test') as CheckState).status).toBe('running');
    });

    it('does NOT affect idle checks', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'fmt', { type: 'check', status: 'idle' });
      sm.markAllStale('wt-1');
      expect((sm.get('wt-1', 'fmt') as CheckState).status).toBe('idle');
    });

    it('does NOT affect service states', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'dev', { type: 'service', status: 'running', port: 3000 });
      sm.markAllStale('wt-1');
      const state = sm.get('wt-1', 'dev') as ServiceState;
      expect(state.status).toBe('running'); // unchanged
    });

    it('only marks stale for the specified worktree', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'fmt', { type: 'check', status: 'passed' });
      sm.set('wt-2', 'fmt', { type: 'check', status: 'passed' });
      sm.markAllStale('wt-1');
      expect((sm.get('wt-1', 'fmt') as CheckState).status).toBe('stale');
      expect((sm.get('wt-2', 'fmt') as CheckState).status).toBe('passed'); // unaffected
    });

    it('notifies listeners for each stalified state', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'fmt', { type: 'check', status: 'passed' });
      sm.set('wt-1', 'lint', { type: 'check', status: 'failed' });
      const listener = vi.fn();
      sm.onChange(listener);
      sm.markAllStale('wt-1');
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('getWorktreeStates', () => {
    it('returns all states for a worktree', () => {
      const sm = new StateManager();
      sm.set('wt-1', 'fmt', { type: 'check', status: 'passed' });
      sm.set('wt-1', 'lint', { type: 'check', status: 'idle' });
      sm.set('wt-2', 'fmt', { type: 'check', status: 'running' });
      const states = sm.getWorktreeStates('wt-1');
      expect(states.size).toBe(2);
      expect(states.has('fmt')).toBe(true);
      expect(states.has('lint')).toBe(true);
    });

    it('returns empty map for unknown worktree', () => {
      const sm = new StateManager();
      expect(sm.getWorktreeStates('nonexistent').size).toBe(0);
    });
  });
});
