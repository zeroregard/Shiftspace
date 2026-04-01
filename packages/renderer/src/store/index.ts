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
  FileDiagnosticSummary,
} from '../types';
import { applyEventReducer } from './applyEvent';
import { createExtrasSlice } from './slices';

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
  /** File diagnostics keyed by `${worktreeId}:${filePath}` */
  fileDiagnostics: Map<string, FileDiagnosticSummary>;
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
  setFileDiagnostics: (worktreeId: string, files: FileDiagnosticSummary[]) => void;
  clearFileDiagnostics: (worktreeId: string) => void;
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
  fileDiagnostics: new Map(),

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

  applyEvent: (event) => set((state) => ({ worktrees: applyEventReducer(state.worktrees, event) })),

  // Action, insight, diagnostics, and misc setters — delegated to keep this function short
  ...createExtrasSlice(set as any),
}));
