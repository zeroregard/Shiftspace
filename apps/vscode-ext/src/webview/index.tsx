import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShiftspaceRenderer, useShiftspaceStore } from '@shiftspace/renderer';
import type { WorktreeState, ShiftspaceEvent } from '@shiftspace/renderer';
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
  | { type: 'error'; message: string };

const App: React.FC = () => {
  const { applyEvent, setWorktrees } = useShiftspaceStore();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    // Register the message listener first, then send 'ready' so we cannot
    // miss a fast synchronous reply from the extension host.
    const handler = (e: MessageEvent<HostMessage>) => {
      const msg = e.data;
      if (msg.type === 'init') {
        setErrorMessage(undefined);
        setWorktrees(msg.worktrees);
      } else if (msg.type === 'event') {
        applyEvent(msg.event);
      } else if (msg.type === 'error') {
        setErrorMessage(msg.message);
      }
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, [applyEvent, setWorktrees]);

  const handleFileClick = (worktreeId: string, filePath: string) => {
    vscode?.postMessage({ type: 'file-click', worktreeId, filePath });
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

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ShiftspaceRenderer onFileClick={handleFileClick} zoomSensitivity={0.03} />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
