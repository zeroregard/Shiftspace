import { useWorktreeStore } from '@shiftspace/renderer-core/src/store/worktreeStore.ts';
import { useInspectionStore } from '@shiftspace/renderer-core/src/store/inspectionStore.ts';
import { useInsightStore } from '@shiftspace/renderer-core/src/store/insightStore.ts';
import { useActionStore } from '@shiftspace/renderer-core/src/store/actionStore.ts';
import type {
  WorktreeState,
  ActionConfig,
  ActionState,
  PipelineConfig,
  FileDiagnosticSummary,
  InsightDetail,
} from '@shiftspace/renderer-core/src/types.ts';

/** Reset all Zustand stores to their initial state. Call in test.beforeEach(). */
export function resetAllStores(): void {
  useWorktreeStore.setState({
    worktrees: new Map(),
    branchLists: new Map(),
    diffModeLoading: new Set(),
    fetchLoading: new Set(),
    swapLoading: new Set(),
    lastFetchAt: new Map(),
  });
  useInspectionStore.setState({
    mode: { type: 'grove' },
    lodLevel: 'worktree',
  });
  useInsightStore.setState({
    insightDetails: new Map(),
    findingsIndex: new Map(),
    fileDiagnostics: new Map(),
    insightsRunning: false,
  });
  useActionStore.setState({
    actionConfigs: [],
    actionStates: new Map(),
    actionLogs: new Map(),
    pipelines: {},
  });
}

/** Seed a worktree into the worktree store. */
export function seedWorktree(wt: WorktreeState): void {
  const worktrees = new Map(useWorktreeStore.getState().worktrees);
  worktrees.set(wt.id, wt);
  useWorktreeStore.setState({ worktrees });
}

/** Seed action configs (checks/services) into the action store. */
export function seedActionConfigs(configs: ActionConfig[]): void {
  useActionStore.getState().setActionConfigs(configs);
}

/** Seed an action state for a specific worktree + action. */
export function seedActionState(worktreeId: string, actionId: string, state: ActionState): void {
  useActionStore.getState().setActionState(worktreeId, actionId, state);
}

/** Seed pipelines into the action store. */
export function seedPipelines(pipelines: Record<string, PipelineConfig>): void {
  useActionStore.getState().setPipelines(pipelines);
}

/** Seed file diagnostics for a worktree. */
export function seedFileDiagnostics(
  worktreeId: string,
  diagnostics: FileDiagnosticSummary[]
): void {
  useInsightStore.getState().setFileDiagnostics(worktreeId, diagnostics);
}

/** Seed an insight detail for a worktree. */
export function seedInsightDetail(
  worktreeId: string,
  insightId: string,
  detail: InsightDetail
): void {
  useInsightStore.getState().setInsightDetail(worktreeId, insightId, detail);
}

/** Enter inspection mode for a specific worktree. */
export function enterInspectionMode(worktreeId: string): void {
  useInspectionStore.getState().enterInspection(worktreeId);
}
