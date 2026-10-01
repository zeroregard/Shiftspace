import { describe, it, expect, beforeEach } from 'vitest';
import { useWorktreeStore } from './worktree-store';
import { useOperationStore, opKey } from './operation-store';
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
      branchLists: new Map(),
      lastFetchAt: new Map(),
      planContents: new Map(),
    });
    useOperationStore.setState({ operations: new Map() });
  });

  it('marks the worktree as removing on worktree-removal-pending but keeps it in the map', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);

    const event: ShiftspaceEvent = { type: 'worktree-removal-pending', worktreeId: 'wt-1' };
    useWorktreeStore.getState().applyEvent(event);

    const ops = useOperationStore.getState().operations;
    expect(ops.get(opKey.removeWorktree('wt-1'))?.status).toBe('pending');
    expect(useWorktreeStore.getState().worktrees.has('wt-1')).toBe(true);
  });

  it('clears the removing marker on worktree-removal-failed but keeps the worktree', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });

    useWorktreeStore.getState().applyEvent({ type: 'worktree-removal-failed', worktreeId: 'wt-1' });

    const ops = useOperationStore.getState().operations;
    expect(ops.has(opKey.removeWorktree('wt-1'))).toBe(false);
    expect(useWorktreeStore.getState().worktrees.has('wt-1')).toBe(true);
  });

  it('deletes the worktree AND clears the removing marker on worktree-removed', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });

    useWorktreeStore.getState().applyEvent({ type: 'worktree-removed', worktreeId: 'wt-1' });

    const ops = useOperationStore.getState().operations;
    expect(useWorktreeStore.getState().worktrees.has('wt-1')).toBe(false);
    expect(ops.has(opKey.removeWorktree('wt-1'))).toBe(false);
  });

  it('handles worktree-removed even when pending was never emitted', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);

    useWorktreeStore.getState().applyEvent({ type: 'worktree-removed', worktreeId: 'wt-1' });

    const ops = useOperationStore.getState().operations;
    expect(useWorktreeStore.getState().worktrees.has('wt-1')).toBe(false);
    expect(ops.has(opKey.removeWorktree('wt-1'))).toBe(false);
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

    const ops = useOperationStore.getState().operations;
    expect(useWorktreeStore.getState().worktrees.has('wt-1')).toBe(false);
    expect(ops.has(opKey.removeWorktree('wt-1'))).toBe(false);
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

    const ops = useOperationStore.getState().operations;
    expect(ops.has(opKey.removeWorktree('wt-a'))).toBe(false);
    expect(useWorktreeStore.getState().worktrees.has('wt-a')).toBe(true);
    expect(ops.has(opKey.removeWorktree('wt-b'))).toBe(false);
    expect(useWorktreeStore.getState().worktrees.has('wt-b')).toBe(false);
  });

  it('is idempotent for repeated worktree-removal-pending events', () => {
    const wt = makeWt({ id: 'wt-1' });
    useWorktreeStore.getState().setWorktrees([wt]);

    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });
    const firstRef = useOperationStore.getState().operations;
    useWorktreeStore
      .getState()
      .applyEvent({ type: 'worktree-removal-pending', worktreeId: 'wt-1' });
    const secondRef = useOperationStore.getState().operations;

    expect(secondRef).toBe(firstRef);
    expect(secondRef.get(opKey.removeWorktree('wt-1'))?.status).toBe('pending');
  });
});

describe('useWorktreeStore – card keys', () => {
  beforeEach(() => {
    useWorktreeStore.setState({ worktrees: new Map(), cardKeys: new Map() });
  });

  const keyOf = (id: string) => useWorktreeStore.getState().cardKeys.get(id);

  function seedThree() {
    useWorktreeStore
      .getState()
      .setWorktrees([
        makeWt({ id: '/repo/a', path: '/repo/a', branch: 'a' }),
        makeWt({ id: '/repo/b', path: '/repo/b', branch: 'b' }),
        makeWt({ id: '/repo/c', path: '/repo/c', branch: 'c' }),
      ]);
  }

  function rename(from: string, to: string) {
    const prev = useWorktreeStore.getState().worktrees.get(from)!;
    useWorktreeStore.getState().applyEvent({
      type: 'worktree-renamed',
      oldWorktreeId: from,
      worktree: { ...prev, id: to, path: to },
    });
  }

  it('gives every worktree its own key', () => {
    seedThree();
    const keys = ['/repo/a', '/repo/b', '/repo/c'].map(keyOf);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(3);
  });

  it('carries the key over to the new id on rename, so the card is not re-mounted', () => {
    seedThree();
    const before = keyOf('/repo/c');
    rename('/repo/c', '/repo/z');
    expect(keyOf('/repo/z')).toBe(before);
    expect(keyOf('/repo/c')).toBeUndefined();
    expect(useWorktreeStore.getState().cardKeys.size).toBe(3);
  });

  it('keeps the key through repeated renames and a full re-init', () => {
    seedThree();
    const before = keyOf('/repo/c');
    rename('/repo/c', '/repo/z');
    rename('/repo/z', '/repo/y');
    useWorktreeStore.getState().setWorktrees([...useWorktreeStore.getState().worktrees.values()]);
    expect(keyOf('/repo/y')).toBe(before);
  });

  it('keeps the key when the branch changes', () => {
    seedThree();
    const before = keyOf('/repo/b');
    const prev = useWorktreeStore.getState().worktrees.get('/repo/b')!;
    useWorktreeStore.getState().applyEvent({
      type: 'worktree-added',
      worktree: { ...prev, branch: 'other' },
    });
    expect(keyOf('/repo/b')).toBe(before);
  });

  it('gives a new worktree at a renamed-away path a fresh key', () => {
    seedThree();
    rename('/repo/c', '/repo/z');
    useWorktreeStore.getState().applyEvent({
      type: 'worktree-added',
      worktree: makeWt({ id: '/repo/c', path: '/repo/c', branch: 'c2' }),
    });
    expect(keyOf('/repo/c')).toBeDefined();
    expect(keyOf('/repo/c')).not.toBe(keyOf('/repo/z'));
  });

  it('drops the key of a removed worktree', () => {
    seedThree();
    useWorktreeStore.getState().applyEvent({ type: 'worktree-removed', worktreeId: '/repo/b' });
    expect(keyOf('/repo/b')).toBeUndefined();
    expect(useWorktreeStore.getState().cardKeys.size).toBe(2);
  });

  it('leaves the key map untouched for events that do not add, remove or rename', () => {
    seedThree();
    const before = useWorktreeStore.getState().cardKeys;
    useWorktreeStore.getState().applyEvent({
      type: 'file-changed',
      worktreeId: '/repo/a',
      file: {
        path: 'x.ts',
        status: 'modified',
        staged: false,
        linesAdded: 1,
        linesRemoved: 0,
        lastChangedAt: 2_000,
      },
    });
    expect(useWorktreeStore.getState().cardKeys).toBe(before);
  });
});
