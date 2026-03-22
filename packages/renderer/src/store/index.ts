import { create } from 'zustand';
import type { WorktreeState, ShiftspaceEvent, LODLevel } from '../types';

interface ShiftspaceStore {
  worktrees: Map<string, WorktreeState>;
  lodLevel: LODLevel;
  setLODLevel: (level: LODLevel) => void;
  applyEvent: (event: ShiftspaceEvent) => void;
  setWorktrees: (worktrees: WorktreeState[]) => void;
}

export const useShiftspaceStore = create<ShiftspaceStore>((set) => ({
  worktrees: new Map(),
  lodLevel: 'worktree',

  setLODLevel: (level) => set({ lodLevel: level }),

  setWorktrees: (worktrees) =>
    set({
      worktrees: new Map(worktrees.map((wt) => [wt.id, wt])),
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
