import { create } from 'zustand';
import type {
  WorktreeState,
  ShiftspaceEvent,
  DiffMode,
  FileChange,
  IconMap,
  WorktreeSortMode,
} from '../types';
import { applyEventReducer } from './apply-event';
import { useOperationStore, opKey } from './operation-store';

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

/**
 * Route add/remove lifecycle events to the operation store so UI spinners
 * can observe them via the same selector pattern as every other async flow.
 * Worktree-data updates still flow through `applyEventReducer` below.
 */
function dispatchLifecycleOperation(event: ShiftspaceEvent): void {
  const ops = useOperationStore.getState();
  switch (event.type) {
    case 'worktree-removal-pending':
      ops.startOperation(opKey.removeWorktree(event.worktreeId), event.worktreeId);
      return;
    case 'worktree-removal-failed':
      ops.clearOperation(opKey.removeWorktree(event.worktreeId));
      return;
    case 'worktree-removed':
      ops.clearOperationsForWorktree(event.worktreeId);
      return;
    case 'worktree-add-pending':
      ops.startOperation(opKey.addWorktree);
      return;
    case 'worktree-add-failed':
    case 'worktree-added':
      ops.clearOperation(opKey.addWorktree);
      return;
    default:
      return;
  }
}

interface WorktreeStore {
  initialized: boolean;
  worktrees: Map<string, WorktreeState>;
  branchLists: Map<string, string[]>;
  lastFetchAt: Map<string, number>;
  sortMode: WorktreeSortMode;
  iconMap: IconMap;
  iconIndex: IconIndex;
  applyEvent: (event: ShiftspaceEvent) => void;
  setWorktrees: (worktrees: WorktreeState[]) => void;
  setDiffMode: (worktreeId: string, diffMode: DiffMode) => void;
  setBranchList: (worktreeId: string, branches: string[]) => void;
  updateWorktreeFiles: (
    worktreeId: string,
    files: FileChange[],
    diffMode: DiffMode,
    branchFiles?: FileChange[]
  ) => void;
  setLastFetchAt: (worktreeId: string, timestamp: number) => void;
  setSortMode: (mode: WorktreeSortMode) => void;
  setIconMap: (map: IconMap) => void;
}

export const useWorktreeStore = create<WorktreeStore>((set) => ({
  initialized: false,
  worktrees: new Map(),
  branchLists: new Map(),
  lastFetchAt: new Map(),
  sortMode: 'name',
  iconMap: {},
  iconIndex: { byName: new Map(), byExt: new Map() },

  applyEvent: (event) => {
    dispatchLifecycleOperation(event);
    set((state) => {
      const nextWorktrees = applyEventReducer(state.worktrees, event);
      if (nextWorktrees === state.worktrees) return state;
      return { worktrees: nextWorktrees };
    });
  },

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
      return { worktrees };
    }),

  setLastFetchAt: (worktreeId, timestamp) =>
    set((state) => {
      const lastFetchAt = new Map(state.lastFetchAt);
      lastFetchAt.set(worktreeId, timestamp);
      return { lastFetchAt };
    }),

  setSortMode: (mode) => set({ sortMode: mode }),

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
