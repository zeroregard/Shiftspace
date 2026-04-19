import { describe, it, expect, beforeEach } from 'vitest';
import { useOperationStore, opKey, isOperationPending } from './operation-store';

describe('useOperationStore', () => {
  beforeEach(() => {
    useOperationStore.setState({ operations: new Map() });
  });

  it('startOperation marks an operation as pending', () => {
    useOperationStore.getState().startOperation(opKey.diffMode('wt-1'), 'wt-1');
    const op = useOperationStore.getState().operations.get(opKey.diffMode('wt-1'));
    expect(op?.status).toBe('pending');
    expect(op?.worktreeId).toBe('wt-1');
  });

  it('startOperation is idempotent when already pending', () => {
    const id = opKey.diffMode('wt-1');
    useOperationStore.getState().startOperation(id, 'wt-1');
    const firstRef = useOperationStore.getState().operations;
    useOperationStore.getState().startOperation(id, 'wt-1');
    const secondRef = useOperationStore.getState().operations;
    expect(secondRef).toBe(firstRef);
  });

  it('succeedOperation transitions pending to success', () => {
    const id = opKey.fetchBranches('wt-1');
    useOperationStore.getState().startOperation(id, 'wt-1');
    useOperationStore.getState().succeedOperation(id);
    expect(useOperationStore.getState().operations.get(id)?.status).toBe('success');
  });

  it('failOperation carries the error string', () => {
    const id = opKey.swapBranches('wt-1');
    useOperationStore.getState().startOperation(id, 'wt-1');
    useOperationStore.getState().failOperation(id, 'swap conflict');
    const op = useOperationStore.getState().operations.get(id);
    expect(op?.status).toBe('failed');
    expect(op?.error).toBe('swap conflict');
  });

  it('clearOperation removes the entry entirely', () => {
    const id = opKey.removeWorktree('wt-1');
    useOperationStore.getState().startOperation(id, 'wt-1');
    useOperationStore.getState().clearOperation(id);
    expect(useOperationStore.getState().operations.has(id)).toBe(false);
  });

  it('clearOperationsForWorktree drops every entry for that worktree', () => {
    const ops = useOperationStore.getState();
    ops.startOperation(opKey.diffMode('wt-1'), 'wt-1');
    ops.startOperation(opKey.fetchBranches('wt-1'), 'wt-1');
    ops.startOperation(opKey.diffMode('wt-2'), 'wt-2');
    ops.clearOperationsForWorktree('wt-1');

    const map = useOperationStore.getState().operations;
    expect(map.has(opKey.diffMode('wt-1'))).toBe(false);
    expect(map.has(opKey.fetchBranches('wt-1'))).toBe(false);
    expect(map.has(opKey.diffMode('wt-2'))).toBe(true);
  });

  it('isOperationPending returns false for unknown / non-pending ids', () => {
    const id = opKey.addWorktree;
    expect(isOperationPending(useOperationStore.getState().operations, id)).toBe(false);
    useOperationStore.getState().startOperation(id);
    expect(isOperationPending(useOperationStore.getState().operations, id)).toBe(true);
    useOperationStore.getState().succeedOperation(id);
    expect(isOperationPending(useOperationStore.getState().operations, id)).toBe(false);
  });
});
