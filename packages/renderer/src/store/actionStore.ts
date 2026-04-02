import { create } from 'zustand';
import type { ActionConfig, ActionState, PipelineConfig } from '../types';

interface ActionStore {
  actionConfigs: ActionConfig[];
  /** Key: `${worktreeId}:${actionId}` */
  actionStates: Map<string, ActionState>;
  /** Key: `${worktreeId}:${actionId}` */
  actionLogs: Map<string, string>;
  pipelines: Record<string, PipelineConfig>;
  setActionConfigs: (configs: ActionConfig[]) => void;
  setActionState: (worktreeId: string, actionId: string, state: ActionState) => void;
  setActionLog: (worktreeId: string, actionId: string, log: string) => void;
  appendActionLog: (worktreeId: string, actionId: string, chunk: string) => void;
  setPipelines: (pipelines: Record<string, PipelineConfig>) => void;
  /** Transitions passed/failed check states to 'stale' for the given worktree */
  markAllStale: (worktreeId: string) => void;
}

export const useActionStore = create<ActionStore>((set) => ({
  actionConfigs: [],
  actionStates: new Map(),
  actionLogs: new Map(),
  pipelines: {},

  setActionConfigs: (configs) => set({ actionConfigs: configs }),

  setActionState: (worktreeId, actionId, state) =>
    set((s) => {
      const actionStates = new Map<string, ActionState>(s.actionStates);
      actionStates.set(`${worktreeId}:${actionId}`, state);
      return { actionStates };
    }),

  setActionLog: (worktreeId, actionId, log) =>
    set((s) => {
      const actionLogs = new Map<string, string>(s.actionLogs);
      actionLogs.set(`${worktreeId}:${actionId}`, log);
      return { actionLogs };
    }),

  appendActionLog: (worktreeId, actionId, chunk) =>
    set((s) => {
      const key = `${worktreeId}:${actionId}`;
      const actionLogs = new Map<string, string>(s.actionLogs);
      actionLogs.set(key, (actionLogs.get(key) ?? '') + chunk);
      return { actionLogs };
    }),

  setPipelines: (pipelines) => set({ pipelines }),

  markAllStale: (worktreeId) =>
    set((s) => {
      const actionStates = new Map<string, ActionState>(s.actionStates);
      let changed = false;
      for (const [key, state] of actionStates) {
        if (
          key.startsWith(`${worktreeId}:`) &&
          (state.status === 'passed' || state.status === 'failed')
        ) {
          actionStates.set(key, { ...state, status: 'stale' });
          changed = true;
        }
      }
      return changed ? { actionStates } : {};
    }),
}));
