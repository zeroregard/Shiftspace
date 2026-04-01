import type {
  ActionConfig,
  ActionState,
  InsightDetail,
  FileDiagnosticSummary,
  PipelineConfig,
  IconMap,
} from '../types';

/** Helper: delete all entries in a Map whose key starts with `${prefix}:`. */
function deleteByPrefix<V>(map: Map<string, V>, prefix: string): boolean {
  let changed = false;
  for (const key of map.keys()) {
    if (key.startsWith(`${prefix}:`)) {
      map.delete(key);
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Each "slice creator" returns a partial store object for `create(...)`.
// The host store spreads these into the main object.
// ---------------------------------------------------------------------------

interface SliceState {
  actionConfigs: ActionConfig[];
  actionStates: Map<string, ActionState>;
  actionLogs: Map<string, string>;
  pipelines: Record<string, PipelineConfig>;
  availablePackages: string[];
  selectedPackage: string;
  iconMap: IconMap;
  insightDetails: Map<string, InsightDetail>;
  fileDiagnostics: Map<string, FileDiagnosticSummary>;
}

type SetFn = (partial: Partial<SliceState> | ((state: SliceState) => Partial<SliceState>)) => void;

export function createExtrasSlice(set: SetFn) {
  return {
    setActionConfigs: (configs: ActionConfig[]) => set({ actionConfigs: configs }),

    setActionState: (worktreeId: string, actionId: string, state: ActionState) =>
      set((s) => {
        const actionStates = new Map(s.actionStates);
        actionStates.set(`${worktreeId}:${actionId}`, state);
        return { actionStates };
      }),

    setIconMap: (map: IconMap) => set({ iconMap: map }),

    setSelectedPackage: (pkg: string) => set({ selectedPackage: pkg }),

    setActionLog: (worktreeId: string, actionId: string, log: string) =>
      set((s) => {
        const actionLogs = new Map(s.actionLogs);
        actionLogs.set(`${worktreeId}:${actionId}`, log);
        return { actionLogs };
      }),

    appendActionLog: (worktreeId: string, actionId: string, chunk: string) =>
      set((s) => {
        const key = `${worktreeId}:${actionId}`;
        const actionLogs = new Map(s.actionLogs);
        actionLogs.set(key, (actionLogs.get(key) ?? '') + chunk);
        return { actionLogs };
      }),

    setPipelines: (pipelines: Record<string, PipelineConfig>) => set({ pipelines }),

    setAvailablePackages: (packages: string[]) => set({ availablePackages: packages }),

    setInsightDetail: (worktreeId: string, insightId: string, detail: InsightDetail) =>
      set((s) => {
        const insightDetails = new Map(s.insightDetails);
        insightDetails.set(`${worktreeId}:${insightId}`, detail);
        return { insightDetails };
      }),

    clearInsightDetails: (worktreeId: string) =>
      set((s) => {
        const insightDetails = new Map(s.insightDetails);
        const changed = deleteByPrefix(insightDetails, worktreeId);
        return changed ? { insightDetails } : {};
      }),

    setFileDiagnostics: (worktreeId: string, files: FileDiagnosticSummary[]) =>
      set((s) => {
        const fileDiagnostics = new Map(s.fileDiagnostics);
        deleteByPrefix(fileDiagnostics, worktreeId);
        for (const file of files) {
          fileDiagnostics.set(`${worktreeId}:${file.filePath}`, file);
        }
        return { fileDiagnostics };
      }),

    clearFileDiagnostics: (worktreeId: string) =>
      set((s) => {
        const fileDiagnostics = new Map(s.fileDiagnostics);
        const changed = deleteByPrefix(fileDiagnostics, worktreeId);
        return changed ? { fileDiagnostics } : {};
      }),

    markAllStale: (worktreeId: string) =>
      set((s) => {
        const actionStates = new Map(s.actionStates);
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
  };
}
