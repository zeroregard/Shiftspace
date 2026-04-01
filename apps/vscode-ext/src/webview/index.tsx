import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ShiftspaceRenderer, useShiftspaceStore } from '@shiftspace/renderer';
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
  // Legacy action messages (kept for backward compat)
  | { type: 'actions-config'; actions: ActionConfig[] }
  | {
      type: 'action-status';
      worktreeId: string;
      actionId: string;
      status: ActionStatus;
      port?: number;
    }
  // New check system messages
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
  | { type: 'diagnostics-update'; worktreeId: string; files: FileDiagnosticSummary[] }
  | { type: 'restore-view-settings'; mode: AppMode; selectedPackage: string };

type Store = ReturnType<typeof useShiftspaceStore.getState>;

function handleCoreMessage(
  msg: HostMessage,
  store: Store,
  setErrorMessage: (m: string | undefined) => void
): boolean {
  switch (msg.type) {
    case 'init':
      setErrorMessage(undefined);
      store.setWorktrees(msg.worktrees);
      return true;
    case 'event':
      store.applyEvent(msg.event);
      return true;
    case 'error':
      setErrorMessage(msg.message);
      return true;
    case 'worktree-files-updated':
      store.updateWorktreeFiles(msg.worktreeId, msg.files, msg.diffMode, msg.branchFiles);
      return true;
    case 'branch-list':
      store.setBranchList(msg.worktreeId, msg.branches);
      return true;
    case 'fetch-loading':
      store.setFetchLoading(msg.worktreeId, msg.loading);
      return true;
    case 'fetch-done':
      store.setFetchLoading(msg.worktreeId, false);
      store.setLastFetchAt(msg.worktreeId, msg.timestamp);
      store.setBranchList(msg.worktreeId, msg.branches);
      return true;
    default:
      return false;
  }
}

function handleActionMessage(msg: HostMessage, store: Store): boolean {
  switch (msg.type) {
    case 'actions-config':
      store.setActionConfigs(msg.actions);
      return true;
    case 'action-status':
      store.setActionState(msg.worktreeId, msg.actionId, { status: msg.status, port: msg.port });
      return true;
    case 'actions-config-v2': {
      const configs: ActionConfig[] = msg.actions.map((a) => ({
        id: a.id,
        label: a.label,
        icon: a.icon,
        persistent: a.type === 'service',
        type: a.type,
      }));
      store.setActionConfigs(configs);
      if (msg.pipelines) store.setPipelines(msg.pipelines);
      store.setSelectedPackage(msg.selectedPackage);
      return true;
    }
    case 'action-state-update':
      store.setActionState(msg.worktreeId, msg.actionId, {
        status: msg.state.status,
        port: msg.state.port,
        durationMs: msg.state.durationMs,
        type: msg.state.type,
      });
      return true;
    case 'action-log-chunk':
      store.appendActionLog(msg.worktreeId, msg.actionId, msg.chunk);
      return true;
    case 'action-log':
      store.setActionLog(msg.worktreeId, msg.actionId, msg.content);
      return true;
    case 'packages-list':
      store.setAvailablePackages(msg.packages);
      return true;
    case 'icon-theme':
      store.setIconMap(msg.payload);
      return true;
    case 'insight-detail':
      store.setInsightDetail(msg.detail.worktreeId, msg.detail.insightId, msg.detail);
      return true;
    case 'diagnostics-update':
      store.setFileDiagnostics(msg.worktreeId, msg.files);
      return true;
    case 'restore-view-settings':
      if (msg.mode.type === 'inspection') store.enterInspection(msg.mode.worktreeId);
      if (msg.selectedPackage) store.setSelectedPackage(msg.selectedPackage);
      return true;
    default:
      return false;
  }
}

function handleHostMessage(
  msg: HostMessage,
  store: Store,
  setErrorMessage: (m: string | undefined) => void
): void {
  if (handleCoreMessage(msg, store, setErrorMessage)) return;
  handleActionMessage(msg, store);
}

const App: React.FC = () => {
  const { setDiffModeLoading, clearInsightDetails, clearFileDiagnostics } = useShiftspaceStore();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const mode = useShiftspaceStore((s) => s.mode as AppMode);

  // Notify the extension host when the mode changes (informational).
  const prevModeRef = React.useRef<AppMode>(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (prev === mode) return;
    if (mode.type === 'inspection') {
      vscode?.postMessage({ type: 'enter-inspection', worktreeId: mode.worktreeId });
    } else {
      if (prev.type === 'inspection') {
        clearInsightDetails(prev.worktreeId);
        clearFileDiagnostics(prev.worktreeId);
      }
      vscode?.postMessage({ type: 'exit-inspection' });
    }
  }, [mode, clearInsightDetails, clearFileDiagnostics]);

  useEffect(() => {
    const handler = (e: MessageEvent<HostMessage>) => {
      if (e.origin && !e.origin.startsWith('vscode-webview://')) return;
      handleHostMessage(e.data, useShiftspaceStore.getState(), setErrorMessage);
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const handleFileClick = (worktreeId: string, filePath: string) => {
    vscode?.postMessage({ type: 'file-click', worktreeId, filePath });
  };

  const handleDiffModeChange = useCallback(
    (worktreeId: string, diffMode: DiffMode) => {
      setDiffModeLoading(worktreeId, true);
      vscode?.postMessage({ type: 'set-diff-mode', worktreeId, diffMode });
    },
    [setDiffModeLoading]
  );

  const handleRequestBranchList = useCallback((worktreeId: string) => {
    vscode?.postMessage({ type: 'get-branch-list', worktreeId });
  }, []);

  const handleCheckoutBranch = useCallback((worktreeId: string, branch: string) => {
    vscode?.postMessage({ type: 'checkout-branch', worktreeId, branch });
  }, []);

  const handleFolderClick = useCallback((worktreeId: string, folderPath: string) => {
    vscode?.postMessage({ type: 'folder-click', worktreeId, folderPath });
  }, []);

  const handleFetchBranches = useCallback((worktreeId: string) => {
    vscode?.postMessage({ type: 'fetch-branches', worktreeId });
  }, []);

  const handleRunAction = useCallback((worktreeId: string, actionId: string) => {
    vscode?.postMessage({ type: 'run-action', worktreeId, actionId });
  }, []);

  const handleStopAction = useCallback((worktreeId: string, actionId: string) => {
    vscode?.postMessage({ type: 'stop-action', worktreeId, actionId });
  }, []);

  const handleSwapBranches = useCallback((worktreeId: string) => {
    vscode?.postMessage({ type: 'swap-branches', worktreeId });
  }, []);

  const handleRemoveWorktree = useCallback((worktreeId: string) => {
    vscode?.postMessage({ type: 'remove-worktree', worktreeId });
  }, []);

  const handleRenameWorktree = useCallback((worktreeId: string, newName: string) => {
    vscode?.postMessage({ type: 'rename-worktree', worktreeId, newName });
  }, []);

  const handleRunPipeline = useCallback((worktreeId: string, pipelineId: string) => {
    vscode?.postMessage({ type: 'run-pipeline', worktreeId, pipelineId });
  }, []);

  const handleSetPackage = useCallback((packageName: string) => {
    vscode?.postMessage({ type: 'set-package', packageName });
  }, []);

  const handleDetectPackages = useCallback(() => {
    vscode?.postMessage({ type: 'detect-packages' });
  }, []);

  const handleGetLog = useCallback((worktreeId: string, actionId: string) => {
    vscode?.postMessage({ type: 'get-log', worktreeId, actionId });
  }, []);

  const handleRecheckInsights = useCallback((worktreeId: string) => {
    vscode?.postMessage({ type: 'recheck-insights', worktreeId });
  }, []);

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
        onRemoveWorktree={handleRemoveWorktree}
        onRenameWorktree={handleRenameWorktree}
        onRunPipeline={handleRunPipeline}
        onSetPackage={handleSetPackage}
        onDetectPackages={handleDetectPackages}
        onGetLog={handleGetLog}
        onRecheckInsights={handleRecheckInsights}
        panZoomConfig={panZoomConfig}
      />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
