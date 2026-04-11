/* eslint-disable max-lines -- TODO: decompose in a follow-up PR */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ShiftspaceRenderer,
  SidebarView,
  ActionsProvider,
  TooltipProvider,
  useWorktreeStore,
  useActionStore,
  useInsightStore,
  useInspectionStore,
  usePackageStore,
} from '@shiftspace/renderer';
import type {
  WorktreeState,
  ShiftspaceEvent,
  PanZoomConfig,
  DiffMode,
  FileChange,
  ActionConfig,
  ActionStatus,
  IconMap,
  AppMode,
  PipelineConfig,
  InsightDetail,
  FileDiagnosticSummary,
} from '@shiftspace/renderer';
import './styles.css';

declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = (function () {
  try {
    return acquireVsCodeApi();
  } catch {
    return undefined;
  }
})();

type HostMessage =
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
  | { type: 'restore-view-settings'; mode: AppMode; selectedPackage: string };

function handleCoreMessage(
  msg: HostMessage,
  setErrorMessage: (m: string | undefined) => void
): boolean {
  const wt = useWorktreeStore.getState();
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
      return true;
    case 'branch-list':
      wt.setBranchList(msg.worktreeId, msg.branches);
      return true;
    case 'fetch-loading':
      wt.setFetchLoading(msg.worktreeId, msg.loading);
      return true;
    case 'fetch-done':
      wt.setFetchLoading(msg.worktreeId, false);
      wt.setLastFetchAt(msg.worktreeId, msg.timestamp);
      wt.setBranchList(msg.worktreeId, msg.branches);
      return true;
    case 'swap-loading':
      wt.setSwapLoading(msg.worktreeId, msg.loading);
      return true;
    default:
      return false;
  }
}

/** Validate message origin using URL protocol parsing instead of substring matching. */
function isAllowedOrigin(origin: string): boolean {
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
      useInsightStore.getState().setInsightsRunning(msg.running);
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

function handleHostMessage(
  msg: HostMessage,
  setErrorMessage: (m: string | undefined) => void
): void {
  if (handleCoreMessage(msg, setErrorMessage)) return;
  handleActionMessage(msg);
}

const App: React.FC = () => {
  const { setDiffModeLoading } = useWorktreeStore();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const mode = useInspectionStore((s) => s.mode as AppMode);

  // Notify the extension host when the mode changes (informational).
  const prevModeRef = React.useRef<AppMode>(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (prev === mode) return;
    if (mode.type === 'inspection') {
      vscode?.postMessage({ type: 'enter-inspection', worktreeId: mode.worktreeId });
    } else {
      vscode?.postMessage({ type: 'exit-inspection' });
    }
  }, [mode]);

  useEffect(() => {
    const handler = (e: MessageEvent<HostMessage>) => {
      if (!isAllowedOrigin(e.origin)) return;
      handleHostMessage(e.data, setErrorMessage);
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const handleFileClick = (worktreeId: string, filePath: string, line?: number) => {
    vscode?.postMessage({ type: 'file-click', worktreeId, filePath, line });
  };

  const handleDiffModeChange = (worktreeId: string, diffMode: DiffMode) => {
    setDiffModeLoading(worktreeId, true);
    vscode?.postMessage({ type: 'set-diff-mode', worktreeId, diffMode });
  };

  const handleRequestBranchList = (worktreeId: string) => {
    vscode?.postMessage({ type: 'get-branch-list', worktreeId });
  };

  const handleCheckoutBranch = (worktreeId: string, branch: string) => {
    vscode?.postMessage({ type: 'checkout-branch', worktreeId, branch });
  };

  const handleFolderClick = (worktreeId: string, folderPath: string) => {
    vscode?.postMessage({ type: 'folder-click', worktreeId, folderPath });
  };

  const handleFetchBranches = (worktreeId: string) => {
    vscode?.postMessage({ type: 'fetch-branches', worktreeId });
  };

  const handleRunAction = (worktreeId: string, actionId: string) => {
    vscode?.postMessage({ type: 'run-action', worktreeId, actionId });
  };

  const handleStopAction = (worktreeId: string, actionId: string) => {
    vscode?.postMessage({ type: 'stop-action', worktreeId, actionId });
  };

  const handleSwapBranches = (worktreeId: string) => {
    vscode?.postMessage({ type: 'swap-branches', worktreeId });
  };

  const handleAddWorktree = () => {
    vscode?.postMessage({ type: 'add-worktree' });
  };

  const handleRemoveWorktree = (worktreeId: string) => {
    vscode?.postMessage({ type: 'remove-worktree', worktreeId });
  };

  const handleRenameWorktree = (worktreeId: string, newName: string) => {
    vscode?.postMessage({ type: 'rename-worktree', worktreeId, newName });
  };

  const handleRunPipeline = (worktreeId: string, pipelineId: string) => {
    vscode?.postMessage({ type: 'run-pipeline', worktreeId, pipelineId });
  };

  const handleSetPackage = (packageName: string) => {
    vscode?.postMessage({ type: 'set-package', packageName });
  };

  const handleDetectPackages = () => {
    vscode?.postMessage({ type: 'detect-packages' });
  };

  const handleGetLog = (worktreeId: string, actionId: string) => {
    vscode?.postMessage({ type: 'get-log', worktreeId, actionId });
  };

  const handleRecheckInsights = (worktreeId: string) => {
    vscode?.postMessage({ type: 'recheck-insights', worktreeId });
  };

  const handleCancelInsights = (worktreeId: string) => {
    vscode?.postMessage({ type: 'cancel-insights', worktreeId });
  };

  if (errorMessage) {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--vscode-descriptionForeground, #888)',
          fontSize: '14px',
        }}
      >
        {errorMessage}
      </div>
    );
  }

  const panZoomConfig: PanZoomConfig = {
    pinchSensitivity: 0.03,
    maxZoom: 1.5,
  };

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ShiftspaceRenderer
        onFileClick={handleFileClick}
        onDiffModeChange={handleDiffModeChange}
        onRequestBranchList={handleRequestBranchList}
        onCheckoutBranch={handleCheckoutBranch}
        onFolderClick={handleFolderClick}
        onFetchBranches={handleFetchBranches}
        onRunAction={handleRunAction}
        onStopAction={handleStopAction}
        onSwapBranches={handleSwapBranches}
        onAddWorktree={handleAddWorktree}
        onRemoveWorktree={handleRemoveWorktree}
        onRenameWorktree={handleRenameWorktree}
        onRunPipeline={handleRunPipeline}
        onSetPackage={handleSetPackage}
        onDetectPackages={handleDetectPackages}
        onGetLog={handleGetLog}
        onRecheckInsights={handleRecheckInsights}
        onCancelInsights={handleCancelInsights}
        panZoomConfig={panZoomConfig}
      />
    </div>
  );
};

const SidebarApp: React.FC = () => {
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    const handler = (e: MessageEvent<HostMessage>) => {
      if (!isAllowedOrigin(e.origin)) return;
      handleCoreMessage(e.data, setErrorMessage);
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const handleWorktreeClick = (worktreeId: string) => {
    vscode?.postMessage({ type: 'worktree-click', worktreeId });
  };

  const handleRequestBranchList = (worktreeId: string) => {
    vscode?.postMessage({ type: 'get-branch-list', worktreeId });
  };

  const handleCheckoutBranch = (worktreeId: string, branch: string) => {
    vscode?.postMessage({ type: 'checkout-branch', worktreeId, branch });
  };

  const handleFetchBranches = (worktreeId: string) => {
    vscode?.postMessage({ type: 'fetch-branches', worktreeId });
  };

  const handleRenameWorktree = (worktreeId: string, newName: string) => {
    vscode?.postMessage({ type: 'rename-worktree', worktreeId, newName });
  };

  const handleRemoveWorktree = (worktreeId: string) => {
    vscode?.postMessage({ type: 'remove-worktree', worktreeId });
  };

  const handleSwapBranches = (worktreeId: string) => {
    vscode?.postMessage({ type: 'swap-branches', worktreeId });
  };

  const handleAddWorktreeSidebar = () => {
    vscode?.postMessage({ type: 'add-worktree' });
  };

  if (errorMessage) {
    return (
      <div
        style={{
          width: '100%',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--vscode-descriptionForeground, #888)',
          fontSize: '13px',
        }}
      >
        {errorMessage}
      </div>
    );
  }

  const wtArray = Array.from(worktrees.values()).sort((a, b) => {
    if (a.isMainWorktree && !b.isMainWorktree) return -1;
    if (!a.isMainWorktree && b.isMainWorktree) return 1;
    const nameA = (a.path.split('/').filter(Boolean).pop() ?? a.path).toLowerCase();
    const nameB = (b.path.split('/').filter(Boolean).pop() ?? b.path).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <ActionsProvider
      onRequestBranchList={handleRequestBranchList}
      onCheckoutBranch={handleCheckoutBranch}
      onFetchBranches={handleFetchBranches}
      onRenameWorktree={handleRenameWorktree}
      onRemoveWorktree={handleRemoveWorktree}
      onSwapBranches={handleSwapBranches}
      onAddWorktree={handleAddWorktreeSidebar}
    >
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <SidebarView worktrees={wtArray} onWorktreeClick={handleWorktreeClick} />
      </TooltipProvider>
    </ActionsProvider>
  );
};

const container = document.getElementById('root');
if (container) {
  const isSidebar = container.dataset.mode === 'sidebar';
  const root = createRoot(container);
  root.render(isSidebar ? <SidebarApp /> : <App />);
}
