import { create } from 'zustand';

/**
 * Cross-cutting store for async operations in flight.
 *
 * Replaces the ad-hoc loading fields that used to live scattered across
 * worktree-store (`diffModeLoading`, `fetchLoading`, `swapLoading`,
 * `removingWorktrees`, `addingWorktree`) and insight-store (`insightsRunning`).
 *
 * Every async flow has the same shape: start → end. Encoding them as entries
 * in a single map means new flows only need an id (see `opKey`) and a call
 * site; the UI and tests observe them through the same selector pattern.
 */

export type OperationStatus = 'pending' | 'success' | 'failed';

export interface OperationState {
  status: OperationStatus;
  /** When set, `clearOperationsForWorktree` removes this entry with the worktree. */
  worktreeId?: string;
  error?: string;
  startedAt: number;
}

/**
 * Stable id builders for the operations the app tracks today. A new flow
 * means: pick a key, call `startOperation` on the edge that kicks it off,
 * and `succeedOperation` / `failOperation` / `clearOperation` on the event
 * that resolves it.
 */
export const opKey = {
  diffMode: (worktreeId: string): string => `diff-mode:${worktreeId}`,
  fetchBranches: (worktreeId: string): string => `fetch-branches:${worktreeId}`,
  swapBranches: (worktreeId: string): string => `swap-branches:${worktreeId}`,
  removeWorktree: (worktreeId: string): string => `remove-worktree:${worktreeId}`,
  addWorktree: 'add-worktree' as const,
  runInsights: 'run-insights' as const,
} as const;

interface OperationStore {
  operations: Map<string, OperationState>;
  /** Mark an operation as pending. Idempotent when the entry is already pending. */
  startOperation: (id: string, worktreeId?: string) => void;
  /** Transition a pending entry to success. No-op when nothing is pending. */
  succeedOperation: (id: string) => void;
  /** Transition a pending entry to failure. No-op when nothing is pending. */
  failOperation: (id: string, error?: string) => void;
  /** Drop the entry entirely, regardless of current status. */
  clearOperation: (id: string) => void;
  /** Drop every entry tagged with this worktreeId — used on worktree removal. */
  clearOperationsForWorktree: (worktreeId: string) => void;
}

export const useOperationStore = create<OperationStore>((set) => ({
  operations: new Map(),

  startOperation: (id, worktreeId) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (existing && existing.status === 'pending') return state;
      const operations = new Map(state.operations);
      operations.set(id, { status: 'pending', worktreeId, startedAt: Date.now() });
      return { operations };
    }),

  succeedOperation: (id) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing || existing.status === 'success') return state;
      const operations = new Map(state.operations);
      operations.set(id, { ...existing, status: 'success', error: undefined });
      return { operations };
    }),

  failOperation: (id, error) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing) return state;
      const operations = new Map(state.operations);
      operations.set(id, { ...existing, status: 'failed', error });
      return { operations };
    }),

  clearOperation: (id) =>
    set((state) => {
      if (!state.operations.has(id)) return state;
      const operations = new Map(state.operations);
      operations.delete(id);
      return { operations };
    }),

  clearOperationsForWorktree: (worktreeId) =>
    set((state) => {
      let changed = false;
      const operations = new Map(state.operations);
      for (const [id, op] of operations) {
        if (op.worktreeId === worktreeId) {
          operations.delete(id);
          changed = true;
        }
      }
      return changed ? { operations } : state;
    }),
}));

/** Selector helper — true when the operation is in flight. */
export function isOperationPending(operations: Map<string, OperationState>, id: string): boolean {
  return operations.get(id)?.status === 'pending';
}
