import { create } from 'zustand';
import type { ActionConfig, ActionState, PipelineConfig } from '../types';
import { storeKey, storeKeyPrefix } from '../utils/storeKeys';

/** Match the extension-side LogStore cap to prevent unbounded growth in the webview. */
const MAX_LOG_CHARS = 1_000_000;

interface ActionStore {
  actionConfigs: ActionConfig[];
  /** Key: storeKey(worktreeId, actionId) */
  actionStates: Map<string, ActionState>;
  /** Key: storeKey(worktreeId, actionId) */
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
      actionStates.set(storeKey(worktreeId, actionId), state);
      return { actionStates };
    }),

  setActionLog: (worktreeId, actionId, log) =>
    set((s) => {
      const actionLogs = new Map<string, string>(s.actionLogs);
      actionLogs.set(storeKey(worktreeId, actionId), log);
      return { actionLogs };
    }),

  appendActionLog: (worktreeId, actionId, chunk) =>
    set((s) => {
      const key = storeKey(worktreeId, actionId);
      const prev = s.actionLogs.get(key) ?? '';
      let combined = prev + chunk;
      if (combined.length > MAX_LOG_CHARS) {
        combined = combined.slice(combined.length - MAX_LOG_CHARS);
      }
      if (combined === prev) return {};
      const actionLogs = new Map(s.actionLogs);
      actionLogs.set(key, combined);
      return { actionLogs };
    }),

  setPipelines: (pipelines) => set({ pipelines }),

  markAllStale: (worktreeId) =>
    set((s) => {
      const actionStates = new Map<string, ActionState>(s.actionStates);
      let changed = false;
      for (const [key, state] of actionStates) {
        if (
          key.startsWith(storeKeyPrefix(worktreeId)) &&
          (state.status === 'passed' || state.status === 'failed')
        ) {
          actionStates.set(key, { ...state, status: 'stale' });
          changed = true;
        }
      }
      return changed ? { actionStates } : {};
    }),
}));
