import { create } from 'zustand';
import type {
  WorktreeState,
  ShiftspaceEvent,
  LODLevel,
  DiffMode,
  FileChange,
  ActionConfig,
  ActionState,
  AppMode,
  IconMap,
  PipelineConfig,
  InsightDetail,
  InsightFinding,
} from '../types';

interface ShiftspaceStore {
  worktrees: Map<string, WorktreeState>;
  lodLevel: LODLevel;
  mode: AppMode;
  branchLists: Map<string, string[]>;
  diffModeLoading: Set<string>;
  fetchLoading: Set<string>;
  lastFetchAt: Map<string, number>;
  actionConfigs: ActionConfig[];
  /** Key: `${worktreeId}:${actionId}` */
  actionStates: Map<string, ActionState>;
  /** Current package filter (default '') */
  selectedPackage: string;
  /** Key: `${worktreeId}:${actionId}` */
  actionLogs: Map<string, string>;
  /** Pipeline configs keyed by pipeline id */
  pipelines: Record<string, PipelineConfig>;
  /** Detected package list */
  availablePackages: string[];
  /**
   * File icon map populated by the VSCode extension host.
   * Empty object in the preview app — FileNode falls back to built-in icons.
   */
  iconMap: IconMap;
  /** Insight details keyed by `${worktreeId}:${insightId}` */
  insightDetails: Map<string, InsightDetail>;
  setLODLevel: (level: LODLevel) => void;
  enterInspection: (worktreeId: string) => void;
  exitInspection: () => void;
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
  setLastFetchAt: (worktreeId: string, timestamp: number) => void;
  setActionConfigs: (configs: ActionConfig[]) => void;
  setActionState: (worktreeId: string, actionId: string, state: ActionState) => void;
  setIconMap: (map: IconMap) => void;
  setSelectedPackage: (pkg: string) => void;
  setActionLog: (worktreeId: string, actionId: string, log: string) => void;
  appendActionLog: (worktreeId: string, actionId: string, chunk: string) => void;
  setPipelines: (pipelines: Record<string, PipelineConfig>) => void;
  setAvailablePackages: (packages: string[]) => void;
  /** Transitions passed/failed check states to 'stale' for the given worktree */
  markAllStale: (worktreeId: string) => void;
  setInsightDetail: (worktreeId: string, insightId: string, detail: InsightDetail) => void;
  /** Clear all insight details for a worktree (called on exit inspection). */
  clearInsightDetails: (worktreeId: string) => void;
}

/**
 * Collect all InsightFindings for a file across all loaded insight plugins.
 * Pass `store.insightDetails` as the first argument.
 */
export function getFileFindings(
  details: Map<string, InsightDetail>,
  worktreeId: string,
  filePath: string
): InsightFinding[] {
  const findings: InsightFinding[] = [];
  for (const [key, detail] of details) {
    if (!key.startsWith(`${worktreeId}:`)) continue;
    const fi = detail.fileInsights.find((f) => f.filePath === filePath);
    if (fi) findings.push(...fi.findings);
  }
  return findings;
}

export const useShiftspaceStore = create<ShiftspaceStore>((set) => ({
  worktrees: new Map(),
  lodLevel: 'worktree',
  mode: { type: 'grove' },
  branchLists: new Map(),
  diffModeLoading: new Set(),
  fetchLoading: new Set(),
  lastFetchAt: new Map(),
  actionConfigs: [],
  actionStates: new Map(),
  selectedPackage: '',
  actionLogs: new Map(),
  pipelines: {},
  availablePackages: [],
  iconMap: {},
  insightDetails: new Map(),

  setLODLevel: (level) => set({ lodLevel: level }),

  enterInspection: (worktreeId) => set({ mode: { type: 'inspection', worktreeId } }),

  exitInspection: () => set({ mode: { type: 'grove' } }),

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

  updateWorktreeFiles: (worktreeId, files, diffMode, branchFiles) =>
    set((state) => {
      const worktrees = new Map(state.worktrees);
      const wt = worktrees.get(worktreeId);
      if (wt) {
        worktrees.set(worktreeId, { ...wt, files, diffMode, branchFiles });
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

  setIconMap: (map) => set({ iconMap: map }),

  setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),

  setActionLog: (worktreeId, actionId, log) =>
    set((s) => {
      const actionLogs = new Map(s.actionLogs);
      actionLogs.set(`${worktreeId}:${actionId}`, log);
      return { actionLogs };
    }),

  appendActionLog: (worktreeId, actionId, chunk) =>
    set((s) => {
      const key = `${worktreeId}:${actionId}`;
      const actionLogs = new Map(s.actionLogs);
      actionLogs.set(key, (actionLogs.get(key) ?? '') + chunk);
      return { actionLogs };
    }),

  setPipelines: (pipelines) => set({ pipelines }),

  setAvailablePackages: (packages) => set({ availablePackages: packages }),

  setInsightDetail: (worktreeId, insightId, detail) =>
    set((s) => {
      const insightDetails = new Map(s.insightDetails);
      insightDetails.set(`${worktreeId}:${insightId}`, detail);
      return { insightDetails };
    }),

  clearInsightDetails: (worktreeId) =>
    set((s) => {
      const insightDetails = new Map(s.insightDetails);
      let changed = false;
      for (const key of insightDetails.keys()) {
        if (key.startsWith(`${worktreeId}:`)) {
          insightDetails.delete(key);
          changed = true;
        }
      }
      return changed ? { insightDetails } : {};
    }),

  markAllStale: (worktreeId) =>
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
