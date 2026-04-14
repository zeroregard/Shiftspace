import { describe, it, expect, beforeEach } from 'vitest';
import { useWorktreeStore } from './worktree-store';
import type { ShiftspaceEvent, WorktreeState } from '../types';

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/repo/wt-1',
    branch: 'feature/x',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 1_000,
    ...overrides,
  };
}

describe('useWorktreeStore – worktree removal lifecycle', () => {
  beforeEach(() => {
    useWorktreeStore.setState({
      worktrees: new Map(),
      removingWorktrees: new Set(),
      branchLists: new Map(),
      diffModeLoading: new Set(),
      fetchLoading: new Set(),
      swapLoading: new Set(),
      lastFetchAt: new Map(),
    });
  });

  it('marks the worktree as removing on worktree-removal-pending but keeps it in the map', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);

    const event: ShiftspaceEvent = { type: 'worktree-removal-pending', worktreeId: 'wt-1' };
    useWorktreeStore.getState().applyEvent(event);

    const state = useWorktreeStore.getState();
    expect(state.removingWorktrees.has('wt-1')).toBe(true);
    expect(state.worktrees.has('wt-1')).toBe(true);
  });

  it('clears the removing marker on worktree-removal-failed but keeps the worktree', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });

    useWorktreeStore.getState().applyEvent({ type: 'worktree-removal-failed', worktreeId: 'wt-1' });

    const state = useWorktreeStore.getState();
    expect(state.removingWorktrees.has('wt-1')).toBe(false);
    expect(state.worktrees.has('wt-1')).toBe(true);
  });

  it('deletes the worktree AND clears the removing marker on worktree-removed', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });

    useWorktreeStore.getState().applyEvent({ type: 'worktree-removed', worktreeId: 'wt-1' });

    const state = useWorktreeStore.getState();
    expect(state.worktrees.has('wt-1')).toBe(false);
    expect(state.removingWorktrees.has('wt-1')).toBe(false);
  });

  it('handles worktree-removed even when pending was never emitted', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);

    useWorktreeStore.getState().applyEvent({ type: 'worktree-removed', worktreeId: 'wt-1' });

    const state = useWorktreeStore.getState();
    expect(state.worktrees.has('wt-1')).toBe(false);
    expect(state.removingWorktrees.has('wt-1')).toBe(false);
  });

  it('pending → failed → pending → removed sequence ends with worktree gone', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);

    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });
    useWorktreeStore.getState().applyEvent({ type: 'worktree-removal-failed', worktreeId: 'wt-1' });
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });
    useWorktreeStore.getState().applyEvent({ type: 'worktree-removed', worktreeId: 'wt-1' });

    const state = useWorktreeStore.getState();
    expect(state.worktrees.has('wt-1')).toBe(false);
    expect(state.removingWorktrees.has('wt-1')).toBe(false);
  });

  it('tracks multiple concurrent removals independently', () => {
    const wtA = makeWt({ id: 'wt-a' });
    const wtB = makeWt({ id: 'wt-b' });
    useWorktreeStore.getState().setWorktrees([wtA, wtB]);

    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-a' });
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-b' });
    useWorktreeStore.getState().applyEvent({ type: 'worktree-removal-failed', worktreeId: 'wt-a' });
    useWorktreeStore.getState().applyEvent({ type: 'worktree-removed', worktreeId: 'wt-b' });

    const state = useWorktreeStore.getState();
    expect(state.removingWorktrees.has('wt-a')).toBe(false);
    expect(state.worktrees.has('wt-a')).toBe(true);
    expect(state.removingWorktrees.has('wt-b')).toBe(false);
    expect(state.worktrees.has('wt-b')).toBe(false);
  });

  it('is idempotent for repeated worktree-removal-pending events', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);

    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });
    const firstRef = useWorktreeStore.getState().removingWorktrees;
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });
    const secondRef = useWorktreeStore.getState().removingWorktrees;

    expect(secondRef).toBe(firstRef);
    expect(secondRef.has('wt-1')).toBe(true);
  });
});
