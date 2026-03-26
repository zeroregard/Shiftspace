import { create } from 'zustand';
import type {
  WorktreeState,
  ShiftspaceEvent,
  LODLevel,
  DiffMode,
  FileChange,
  ActionConfig,
  ActionState,
} from '../types';

interface ShiftspaceStore {
  worktrees: Map<string, WorktreeState>;
  lodLevel: LODLevel;
  branchLists: Map<string, string[]>;
  diffModeLoading: Set<string>;
  fetchLoading: Set<string>;
  lastFetchAt: Map<string, number>;
  actionConfigs: ActionConfig[];
  /** Key: `${worktreeId}:${actionId}` */
  actionStates: Map<string, ActionState>;
  setLODLevel: (level: LODLevel) => void;
  applyEvent: (event: ShiftspaceEvent) => void;
  setWorktrees: (worktrees: WorktreeState[]) => void;
  setDiffMode: (worktreeId: string, diffMode: DiffMode) => void;
  setDiffModeLoading: (worktreeId: string, loading: boolean) => void;
  setBranchList: (worktreeId: string, branches: string[]) => void;
  updateWorktreeFiles: (worktreeId: string, files: FileChange[], diffMode: DiffMode) => void;
  setFetchLoading: (worktreeId: string, loading: boolean) => void;
  setLastFetchAt: (worktreeId: string, timestamp: number) => void;
  setActionConfigs: (configs: ActionConfig[]) => void;
  setActionState: (worktreeId: string, actionId: string, state: ActionState) => void;
}

export const useShiftspaceStore = create<ShiftspaceStore>((set) => ({
  worktrees: new Map(),
  lodLevel: 'worktree',
  branchLists: new Map(),
  diffModeLoading: new Set(),
  fetchLoading: new Set(),
  lastFetchAt: new Map(),
  actionConfigs: [],
  actionStates: new Map(),

  setLODLevel: (level) => set({ lodLevel: level }),

  setWorktrees: (worktrees) =>
    set({
      worktrees: new Map(worktrees.map((wt) => [wt.id, wt])),
    }),

  setDiffMode: (worktreeId, diffMode) =>
    set((state) => {
      const worktrees = new Map(state.worktrees);
      const wt = worktrees.get(worktreeId);
      if (wt) {
        worktrees.set(worktreeId, { ...wt, diffMode });
      }
      return { worktrees };
    }),

  setDiffModeLoading: (worktreeId, loading) =>
    set((state) => {
      const diffModeLoading = new Set(state.diffModeLoading);
      if (loading) {
        diffModeLoading.add(worktreeId);
      } else {
        diffModeLoading.delete(worktreeId);
      }
      return { diffModeLoading };
    }),

  setBranchList: (worktreeId, branches) =>
    set((state) => {
      const branchLists = new Map(state.branchLists);
      branchLists.set(worktreeId, branches);
      return { branchLists };
    }),

  updateWorktreeFiles: (worktreeId, files, diffMode) =>
    set((state) => {
      const worktrees = new Map(state.worktrees);
      const wt = worktrees.get(worktreeId);
      if (wt) {
        worktrees.set(worktreeId, { ...wt, files, diffMode });
      }
      const diffModeLoading = new Set(state.diffModeLoading);
      diffModeLoading.delete(worktreeId);
      return { worktrees, diffModeLoading };
    }),

  setFetchLoading: (worktreeId, loading) =>
    set((state) => {
      const fetchLoading = new Set(state.fetchLoading);
      if (loading) fetchLoading.add(worktreeId);
      else fetchLoading.delete(worktreeId);
      return { fetchLoading };
    }),

  setLastFetchAt: (worktreeId, timestamp) =>
    set((state) => {
      const lastFetchAt = new Map(state.lastFetchAt);
      lastFetchAt.set(worktreeId, timestamp);
      return { lastFetchAt };
    }),

  setActionConfigs: (configs) => set({ actionConfigs: configs }),

  setActionState: (worktreeId, actionId, state) =>
    set((s) => {
      const actionStates = new Map(s.actionStates);
      actionStates.set(`${worktreeId}:${actionId}`, state);
      return { actionStates };
    }),

  applyEvent: (event) =>
    set((state) => {
      const worktrees = new Map(state.worktrees);

      switch (event.type) {
        case 'worktree-added': {
          worktrees.set(event.worktree.id, event.worktree);
          break;
        }
        case 'worktree-removed': {
          worktrees.delete(event.worktreeId);
          break;
        }
        case 'file-changed': {
          const wt = worktrees.get(event.worktreeId);
          if (wt) {
            const files = wt.files.filter((f) => f.path !== event.file.path);
            worktrees.set(event.worktreeId, { ...wt, files: [...files, event.file] });
          }
          break;
        }
        case 'file-removed': {
          const wt = worktrees.get(event.worktreeId);
          if (wt) {
            const files = wt.files.filter((f) => f.path !== event.filePath);
            worktrees.set(event.worktreeId, { ...wt, files });
          }
          break;
        }
        case 'file-staged': {
          const wt = worktrees.get(event.worktreeId);
          if (wt) {
            const files = wt.files.map((f) =>
              f.path === event.filePath ? { ...f, staged: true } : f
            );
            worktrees.set(event.worktreeId, { ...wt, files });
          }
          break;
        }
        case 'process-started': {
          const wt = worktrees.get(event.worktreeId);
          if (wt) {
            worktrees.set(event.worktreeId, {
              ...wt,
              process: { port: event.port, command: event.command },
            });
          }
          break;
        }
        case 'process-stopped': {
          const wt = worktrees.get(event.worktreeId);
          if (wt) {
            const { process: _removed, ...rest } = wt;
            worktrees.set(event.worktreeId, rest);
          }
          break;
        }
      }

      return { worktrees };
    }),
}));
