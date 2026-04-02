import { create } from 'zustand';
import type { LODLevel, AppMode } from '../types';

interface InspectionStore {
  mode: AppMode;
  lodLevel: LODLevel;
  enterInspection: (worktreeId: string) => void;
  exitInspection: () => void;
  setLODLevel: (level: LODLevel) => void;
}

export const useInspectionStore = create<InspectionStore>((set) => ({
  mode: { type: 'grove' },
  lodLevel: 'worktree',

  enterInspection: (worktreeId) => set({ mode: { type: 'inspection', worktreeId } }),
  exitInspection: () => set({ mode: { type: 'grove' } }),
  setLODLevel: (level) => set({ lodLevel: level }),
}));
