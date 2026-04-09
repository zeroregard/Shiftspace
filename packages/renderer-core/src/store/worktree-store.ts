import { create } from 'zustand';
import type { WorktreeState, ShiftspaceEvent, DiffMode, FileChange, IconMap } from '../types';
import { applyEventReducer } from './apply-event';

/**
 * Reverse index built from the icon map so that new files can resolve an
 * icon by filename or extension in O(1) without scanning the full map.
 */
interface IconIndex {
  /** Exact filename → dark data URI (e.g. "package.json" → "data:...") */
  byName: Map<string, string>;
  /** Extension (with dot) → dark data URI (e.g. ".ts" → "data:...") */
  byExt: Map<string, string>;
}

function buildIconIndex(iconMap: IconMap): IconIndex {
  const byName = new Map<string, string>();
  const byExt = new Map<string, string>();
  for (const [filePath, entry] of Object.entries(iconMap)) {
    const dark = entry.dark;
    if (!dark) continue;
    const name = filePath.split('/').pop() ?? filePath;
    if (!byName.has(name)) byName.set(name, dark);
    const lastDot = name.lastIndexOf('.');
    if (lastDot !== -1) {
      const ext = name.slice(lastDot);
      if (!byExt.has(ext)) byExt.set(ext, dark);
    }
  }
  return { byName, byExt };
}

interface WorktreeStore {
  initialized: boolean;
  worktrees: Map<string, WorktreeState>;
  branchLists: Map<string, string[]>;
  diffModeLoading: Set<string>;
  fetchLoading: Set<string>;
  swapLoading: Set<string>;
  lastFetchAt: Map<string, number>;
  iconMap: IconMap;
  iconIndex: IconIndex;
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
  initialized: false,
  worktrees: new Map(),
  branchLists: new Map(),
  diffModeLoading: new Set(),
  fetchLoading: new Set(),
  swapLoading: new Set(),
  lastFetchAt: new Map(),
  iconMap: {},
  iconIndex: { byName: new Map(), byExt: new Map() },

  applyEvent: (event) => set((state) => ({ worktrees: applyEventReducer(state.worktrees, event) })),

  setWorktrees: (worktrees) =>
    set({ initialized: true, worktrees: new Map(worktrees.map((wt) => [wt.id, wt])) }),

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

  setIconMap: (map) =>
    set((state) => {
      // Merge new entries into the existing map; skip update if nothing changed.
      const merged = { ...state.iconMap };
      let changed = false;
      for (const [key, value] of Object.entries(map)) {
        if (merged[key]?.dark !== value.dark || merged[key]?.light !== value.light) {
          merged[key] = value;
          changed = true;
        }
      }
      if (!changed) return state;
      return { iconMap: merged, iconIndex: buildIconIndex(merged) };
    }),
}));
