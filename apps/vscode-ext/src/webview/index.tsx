import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ShiftspaceRenderer,
  SidebarView,
  ActionsProvider,
  TooltipProvider,
  useWorktreeStore,
  useInspectionStore,
  useOperationStore,
  opKey,
  setComponentErrorReporter,
} from '@shiftspace/renderer';
import type { PanZoomConfig, DiffMode, AppMode } from '@shiftspace/renderer';
import { handleHostMessage, isAllowedOrigin, type HostMessage } from './host-messages';
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

/** Report errors to the extension host so they appear in the Output channel. */
function reportError(label: string, error: unknown): void {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  console.error(`[Shiftspace] ${label}:`, error);
  vscode?.postMessage({ type: 'webview-error', error: `${label}: ${message}` });
}

// Catch unhandled errors so they surface in the Output channel
window.addEventListener('error', (e) => {
  reportError('Uncaught error', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  reportError('Unhandled promise rejection', e.reason);
});

// Forward React ErrorBoundary catches to the Output channel
setComponentErrorReporter((error, componentStack) => {
  const detail = componentStack ? `${error.message}\n${componentStack}` : error.message;
  reportError('Component error', detail);
});

const App: React.FC = () => {
  const startOperation = useOperationStore((s) => s.startOperation);
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
    startOperation(opKey.diffMode(worktreeId), worktreeId);
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

  const handleLoadPlanContent = (worktreeId: string) => {
    vscode?.postMessage({ type: 'load-plan-content', worktreeId });
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

  const handleOpenExternalUrl = (url: string) => {
    vscode?.postMessage({ type: 'open-external-url', url });
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
        onLoadPlanContent={handleLoadPlanContent}
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
        onOpenExternalUrl={handleOpenExternalUrl}
        onSortChange={(mode) => vscode?.postMessage({ type: 'set-sort-mode', mode })}
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
      handleHostMessage(e.data, setErrorMessage);
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

  const handleOpenExternalUrl = (url: string) => {
    vscode?.postMessage({ type: 'open-external-url', url });
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

  const wtArray = Array.from(worktrees.values());

  return (
    <ActionsProvider
      onRequestBranchList={handleRequestBranchList}
      onCheckoutBranch={handleCheckoutBranch}
      onFetchBranches={handleFetchBranches}
      onRenameWorktree={handleRenameWorktree}
      onRemoveWorktree={handleRemoveWorktree}
      onSwapBranches={handleSwapBranches}
      onAddWorktree={handleAddWorktreeSidebar}
      onOpenExternalUrl={handleOpenExternalUrl}
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
