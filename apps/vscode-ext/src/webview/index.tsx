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
  | { type: 'actions-config'; actions: ActionConfig[] }
  | {
      type: 'action-status';
      worktreeId: string;
      actionId: string;
      status: ActionStatus;
      port?: number;
    }
  | { type: 'icon-theme'; payload: IconMap };

const App: React.FC = () => {
  const {
    applyEvent,
    setWorktrees,
    updateWorktreeFiles,
    setBranchList,
    setDiffModeLoading,
    setFetchLoading,
    setLastFetchAt,
    setActionConfigs,
    setActionState,
    setIconMap,
  } = useShiftspaceStore();
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
      vscode?.postMessage({ type: 'exit-inspection' });
    }
  }, [mode]);

  useEffect(() => {
    // Register the message listener first, then send 'ready' so we cannot
    // miss a fast synchronous reply from the extension host.
    console.log('[Shiftspace webview] message listener registered');
    const handler = (e: MessageEvent<HostMessage>) => {
      // Guard against messages from unexpected origins (basic prompt-injection defence)
      if (e.origin && !e.origin.startsWith('vscode-webview://')) {
        console.log('[Shiftspace webview] message blocked by origin guard | origin =', e.origin);
        return;
      }
      const msg = e.data;
      if (msg.type === 'init') {
        setErrorMessage(undefined);
        setWorktrees(msg.worktrees);
      } else if (msg.type === 'event') {
        applyEvent(msg.event);
      } else if (msg.type === 'error') {
        setErrorMessage(msg.message);
      } else if (msg.type === 'worktree-files-updated') {
        updateWorktreeFiles(msg.worktreeId, msg.files, msg.diffMode, msg.branchFiles);
      } else if (msg.type === 'branch-list') {
        setBranchList(msg.worktreeId, msg.branches);
      } else if (msg.type === 'fetch-loading') {
        setFetchLoading(msg.worktreeId, msg.loading);
      } else if (msg.type === 'fetch-done') {
        setFetchLoading(msg.worktreeId, false);
        setLastFetchAt(msg.worktreeId, msg.timestamp);
        setBranchList(msg.worktreeId, msg.branches);
      } else if (msg.type === 'actions-config') {
        setActionConfigs(msg.actions);
      } else if (msg.type === 'action-status') {
        setActionState(msg.worktreeId, msg.actionId, {
          status: msg.status,
          port: msg.port,
        });
      } else if (msg.type === 'icon-theme') {
        const keys = Object.keys(msg.payload);
        console.log(
          '[Shiftspace webview] icon-theme received | keys:',
          keys.length,
          '| sample:',
          keys.slice(0, 5)
        );
        if (keys.length > 0) {
          const sampleEntry = msg.payload[keys[0]!];
          console.log(
            '[Shiftspace webview] icon-theme sample entry for',
            keys[0],
            ':',
            sampleEntry?.dark?.slice(0, 60) + '...'
          );
        }
        setIconMap(msg.payload);
      }
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, [
    applyEvent,
    setWorktrees,
    updateWorktreeFiles,
    setBranchList,
    setDiffModeLoading,
    setFetchLoading,
    setLastFetchAt,
    setActionConfigs,
    setActionState,
    setIconMap,
  ]);

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
    pinchSensitivity: 0.03, // Electron delivers smaller pinch deltaY than Chrome
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
