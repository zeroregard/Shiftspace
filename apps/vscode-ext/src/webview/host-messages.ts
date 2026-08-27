import {
  useWorktreeStore,
  useActionStore,
  useInsightStore,
  useInspectionStore,
  usePackageStore,
  useSettingsStore,
  useOperationStore,
  opKey,
  planContentKey,
} from '@shiftspace/renderer';
import type {
  WorktreeState,
  ShiftspaceEvent,
  DiffMode,
  WorktreeDiffCountMode,
  FileChange,
  ActionConfig,
  ActionStatus,
  IconMap,
  AppMode,
  PipelineConfig,
  InsightDetail,
  FileDiagnosticSummary,
} from '@shiftspace/renderer';

/**
 * Every message the extension host sends to a webview, and the single place
 * they are applied to the renderer stores.
 *
 * Both views — the tab (`App`) and the activity-bar sidebar (`SidebarApp`) —
 * route through `handleHostMessage`. They render the same worktree cards from
 * the same stores, so a message only one of them applies leaves the two views
 * disagreeing: that is how the sidebar came to ignore `settings-update`.
 */

export type HostMessage =
  | { type: 'init'; worktrees: WorktreeState[] }
  | { type: 'event'; event: ShiftspaceEvent }
  | { type: 'error'; message: string }
  | {
      type: 'worktree-files-updated';
      worktreeId: string;
      files: FileChange[];
      diffMode: DiffMode;
      branchFiles?: FileChange[];
    }
  | { type: 'branch-list'; worktreeId: string; branches: string[] }
  | {
      type: 'plan-content';
      worktreeId: string;
      planPath: string;
      status: 'loaded' | 'missing' | 'error';
      content?: string;
      truncated?: boolean;
      message?: string;
    }
  | { type: 'fetch-loading'; worktreeId: string; loading: boolean }
  | { type: 'fetch-done'; worktreeId: string; timestamp: number; branches: string[] }
  | { type: 'swap-loading'; worktreeId: string; loading: boolean }
  | {
      type: 'actions-config-v2';
      actions: Array<{ id: string; label: string; type: 'check' | 'service'; icon: string }>;
      pipelines?: Record<string, PipelineConfig>;
      selectedPackage: string;
    }
  | {
      type: 'action-state-update';
      worktreeId: string;
      actionId: string;
      state: {
        type: 'check' | 'service';
        status: ActionStatus;
        durationMs?: number;
        port?: number;
      };
    }
  | {
      type: 'action-log-chunk';
      worktreeId: string;
      actionId: string;
      chunk: string;
      isStderr: boolean;
    }
  | { type: 'action-log'; worktreeId: string; actionId: string; content: string }
  | { type: 'packages-list'; packages: string[] }
  | { type: 'icon-theme'; payload: IconMap }
  | { type: 'insight-detail'; detail: InsightDetail }
  | { type: 'insights-status'; running: boolean }
  | { type: 'diagnostics-update'; worktreeId: string; files: FileDiagnosticSummary[] }
  | { type: 'diagnostics-remove'; worktreeId: string; filePaths: string[] }
  | { type: 'restore-view-settings'; mode: AppMode; selectedPackage: string }
  | { type: 'set-sort-mode'; mode: 'last-updated' | 'name' | 'branch' }
  | {
      type: 'settings-update';
      ticketUrlTemplate: string;
      worktreeDiffCount: WorktreeDiffCountMode;
    };

export function handleCoreMessage(
  msg: HostMessage,
  setErrorMessage: (m: string | undefined) => void
): boolean {
  const wt = useWorktreeStore.getState();
  const ops = useOperationStore.getState();
  switch (msg.type) {
    case 'init':
      setErrorMessage(undefined);
      wt.setWorktrees(msg.worktrees);
      return true;
    case 'event':
      wt.applyEvent(msg.event);
      return true;
    case 'error':
      setErrorMessage(msg.message);
      return true;
    case 'worktree-files-updated':
      wt.updateWorktreeFiles(msg.worktreeId, msg.files, msg.diffMode, msg.branchFiles);
      ops.clearOperation(opKey.diffMode(msg.worktreeId));
      return true;
    case 'branch-list':
      wt.setBranchList(msg.worktreeId, msg.branches);
      return true;
    case 'plan-content': {
      const key = planContentKey(msg.worktreeId, msg.planPath);
      if (msg.status === 'loaded') {
        wt.setPlanContent(key, {
          status: 'loaded',
          content: msg.content ?? '',
          truncated: msg.truncated ?? false,
        });
      } else if (msg.status === 'missing') {
        wt.setPlanContent(key, { status: 'missing' });
      } else {
        wt.setPlanContent(key, { status: 'error', message: msg.message ?? 'Failed to load plan' });
      }
      return true;
    }
    case 'fetch-loading':
      if (msg.loading) ops.startOperation(opKey.fetchBranches(msg.worktreeId), msg.worktreeId);
      else ops.clearOperation(opKey.fetchBranches(msg.worktreeId));
      return true;
    case 'fetch-done':
      ops.clearOperation(opKey.fetchBranches(msg.worktreeId));
      wt.setLastFetchAt(msg.worktreeId, msg.timestamp);
      wt.setBranchList(msg.worktreeId, msg.branches);
      return true;
    case 'swap-loading':
      if (msg.loading) ops.startOperation(opKey.swapBranches(msg.worktreeId), msg.worktreeId);
      else ops.clearOperation(opKey.swapBranches(msg.worktreeId));
      return true;
    case 'set-sort-mode':
      wt.setSortMode(msg.mode);
      return true;
    case 'settings-update':
      useSettingsStore.getState().setTicketUrlTemplate(msg.ticketUrlTemplate);
      useSettingsStore.getState().setWorktreeDiffCount(msg.worktreeDiffCount);
      return true;
    default:
      return false;
  }
}

/** Validate message origin using URL protocol parsing instead of substring matching. */
export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).protocol === 'vscode-webview:';
  } catch {
    return false;
  }
}

function handleActionMessage(msg: HostMessage): boolean {
  switch (msg.type) {
    case 'actions-config-v2': {
      const configs: ActionConfig[] = msg.actions.map((a) => ({
        id: a.id,
        label: a.label,
        icon: a.icon,
        persistent: a.type === 'service',
        type: a.type,
      }));
      useActionStore.getState().setActionConfigs(configs);
      if (msg.pipelines) useActionStore.getState().setPipelines(msg.pipelines);
      usePackageStore.getState().setSelectedPackage(msg.selectedPackage);
      return true;
    }
    case 'action-state-update':
      useActionStore.getState().setActionState(msg.worktreeId, msg.actionId, {
        status: msg.state.status,
        port: msg.state.port,
        durationMs: msg.state.durationMs,
        type: msg.state.type,
      });
      return true;
    case 'action-log-chunk':
      useActionStore.getState().appendActionLog(msg.worktreeId, msg.actionId, msg.chunk);
      return true;
    case 'action-log':
      useActionStore.getState().setActionLog(msg.worktreeId, msg.actionId, msg.content);
      return true;
    case 'packages-list':
      usePackageStore.getState().setAvailablePackages(msg.packages);
      return true;
    case 'icon-theme':
      useWorktreeStore.getState().setIconMap(msg.payload);
      return true;
    case 'insight-detail':
      useInsightStore
        .getState()
        .setInsightDetail(msg.detail.worktreeId, msg.detail.insightId, msg.detail);
      return true;
    case 'insights-status':
      if (msg.running) useOperationStore.getState().startOperation(opKey.runInsights);
      else useOperationStore.getState().clearOperation(opKey.runInsights);
      return true;
    case 'diagnostics-update':
      useInsightStore.getState().setFileDiagnostics(msg.worktreeId, msg.files);
      return true;
    case 'diagnostics-remove':
      useInsightStore.getState().removeFileDiagnostics(msg.worktreeId, msg.filePaths);
      return true;
    case 'restore-view-settings':
      if (msg.mode.type === 'inspection')
        useInspectionStore.getState().enterInspection(msg.mode.worktreeId);
      if (msg.selectedPackage) usePackageStore.getState().setSelectedPackage(msg.selectedPackage);
      return true;
    default:
      return false;
  }
}

/** Apply one host message to the renderer stores. */
export function handleHostMessage(
  msg: HostMessage,
  setErrorMessage: (m: string | undefined) => void
): void {
  if (handleCoreMessage(msg, setErrorMessage)) return;
  handleActionMessage(msg);
}
