import { create } from 'zustand';
import type { WorktreeState, ShiftspaceEvent, DiffMode, FileChange, IconMap } from '../types';
import { applyEventReducer } from './applyEvent';

interface WorktreeStore {
  worktrees: Map<string, WorktreeState>;
  branchLists: Map<string, string[]>;
  diffModeLoading: Set<string>;
  fetchLoading: Set<string>;
  swapLoading: Set<string>;
  lastFetchAt: Map<string, number>;
  iconMap: IconMap;
  applyEvent: (event: ShiftspaceEvent) => void;
  setWorktrees: (worktrees: WorktreeState[]) => void;
  setDiffMode: (worktreeId: string, diffMode: DiffMode) => void;
  setDiffModeLoading: (worktreeId: string, loading: boolean) => void;
  setBranchList: (worktreeId: string, branches: string[]) => void;
  updateWorktreeFiles: (
    worktreeId: string,
    files: FileChange[],
    diffMode: DiffMode,
    branchFiles?: FileChange[]
  ) => void;
  setFetchLoading: (worktreeId: string, loading: boolean) => void;
  setSwapLoading: (worktreeId: string, loading: boolean) => void;
  setLastFetchAt: (worktreeId: string, timestamp: number) => void;
  setIconMap: (map: IconMap) => void;
}

export const useWorktreeStore = create<WorktreeStore>((set) => ({
  worktrees: new Map(),
  branchLists: new Map(),
  diffModeLoading: new Set(),
  fetchLoading: new Set(),
  swapLoading: new Set(),
  lastFetchAt: new Map(),
  iconMap: {},

  applyEvent: (event) => set((state) => ({ worktrees: applyEventReducer(state.worktrees, event) })),

  setWorktrees: (worktrees) => set({ worktrees: new Map(worktrees.map((wt) => [wt.id, wt])) }),

  setDiffMode: (worktreeId, diffMode) =>
    set((state) => {
      const wt = state.worktrees.get(worktreeId);
      if (!wt) return state;
      const worktrees = new Map(state.worktrees);
      worktrees.set(worktreeId, { ...wt, diffMode });
      return { worktrees };
    }),

  setDiffModeLoading: (worktreeId, loading) =>
    set((state) => {
      const has = state.diffModeLoading.has(worktreeId);
      if (loading && has) return state;
      if (!loading && !has) return state;
      const diffModeLoading = new Set(state.diffModeLoading);
      if (loading) diffModeLoading.add(worktreeId);
      else diffModeLoading.delete(worktreeId);
      return { diffModeLoading };
    }),

  setBranchList: (worktreeId, branches) =>
    set((state) => {
      const branchLists = new Map(state.branchLists);
      branchLists.set(worktreeId, branches);
      return { branchLists };
    }),

  updateWorktreeFiles: (worktreeId, files, diffMode, branchFiles) =>
    set((state) => {
      const wt = state.worktrees.get(worktreeId);
      if (!wt) return state;
      const worktrees = new Map(state.worktrees);
      worktrees.set(worktreeId, { ...wt, files, diffMode, branchFiles });
      const hadLoading = state.diffModeLoading.has(worktreeId);
      if (!hadLoading) return { worktrees };
      const diffModeLoading = new Set(state.diffModeLoading);
      diffModeLoading.delete(worktreeId);
      return { worktrees, diffModeLoading };
    }),

  setFetchLoading: (worktreeId, loading) =>
    set((state) => {
      const has = state.fetchLoading.has(worktreeId);
      if (loading && has) return state;
      if (!loading && !has) return state;
      const fetchLoading = new Set(state.fetchLoading);
      if (loading) fetchLoading.add(worktreeId);
      else fetchLoading.delete(worktreeId);
      return { fetchLoading };
    }),

  setSwapLoading: (worktreeId, loading) =>
    set((state) => {
      const has = state.swapLoading.has(worktreeId);
      if (loading && has) return state;
      if (!loading && !has) return state;
      const swapLoading = new Set(state.swapLoading);
      if (loading) swapLoading.add(worktreeId);
      else swapLoading.delete(worktreeId);
      return { swapLoading };
    }),

  setLastFetchAt: (worktreeId, timestamp) =>
    set((state) => {
      const lastFetchAt = new Map(state.lastFetchAt);
      lastFetchAt.set(worktreeId, timestamp);
      return { lastFetchAt };
    }),

  setIconMap: (map) => set({ iconMap: map }),
}));
