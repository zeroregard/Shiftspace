import React, { useEffect, useRef, useState, useCallback } from 'react';
import '@vscode/codicons/dist/codicon.css';
import { ShiftspaceRenderer, useShiftspaceStore } from '@shiftspace/renderer';
import type { ShiftspaceEvent, DiffMode, ViewMode } from '@shiftspace/renderer';
import { MockEngine, MOCK_BRANCHES } from './mock/engine';
import { ControlPanel } from './controls/ControlPanel';

const VIEW_MODE_KEY = 'shiftspace.viewMode';

function loadPersistedViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === 'tree' || stored === 'slim' || stored === 'list') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'tree';
}

export const App: React.FC = () => {
  const engineRef = useRef<MockEngine | null>(null);
  const [worktreeIds, setWorktreeIds] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  const { updateWorktreeFiles, setDiffModeLoading, setBranchList, setDiffMode, setViewMode } =
    useShiftspaceStore();

  // Initialize persisted view mode on mount
  useEffect(() => {
    setViewMode(loadPersistedViewMode());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!engineRef.current) {
    engineRef.current = new MockEngine();
  }

  useEffect(() => {
    const engine = engineRef.current!;
    setWorktreeIds(engine.getWorktrees().map((wt) => wt.id));

    const unsub = engine.subscribe((event: ShiftspaceEvent) => {
      if (event.type === 'worktree-added') {
        setWorktreeIds((ids) => [...ids, event.worktree.id]);
      } else if (event.type === 'worktree-removed') {
        setWorktreeIds((ids) => ids.filter((id) => id !== event.worktreeId));
      }
    });

    return () => {
      unsub();
    };
  }, [resetKey]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
    };
  }, []);

  const onEvent = useCallback(
    (handler: (event: ShiftspaceEvent) => void) => {
      return engineRef.current!.subscribe(handler);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey]
  );

  const handleDiffModeChange = useCallback(
    (worktreeId: string, diffMode: DiffMode) => {
      // Optimistically update the diff mode
      setDiffMode(worktreeId, diffMode);
      setDiffModeLoading(worktreeId, true);

      // Simulate async fetch
      setTimeout(() => {
        const engine = engineRef.current;
        if (!engine) return;

        const files =
          diffMode.type === 'working'
            ? [] // For working mode, return empty (agents will populate via events)
            : engine.getMockBranchFiles(worktreeId); // Branch mode: mock files

        updateWorktreeFiles(worktreeId, files, diffMode);
      }, 200);
    },
    [setDiffMode, setDiffModeLoading, updateWorktreeFiles]
  );

  const handleRequestBranchList = useCallback(
    (worktreeId: string) => {
      setBranchList(worktreeId, MOCK_BRANCHES);
    },
    [setBranchList]
  );

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  const handleReset = () => {
    engineRef.current?.reset();
    setResetKey((k) => k + 1);
  };

  const handleAddWorktree = () => {
    const id = engineRef.current?.addPresetWorktree(worktreeIds.length);
    if (id) setWorktreeIds((ids) => [...ids, id]);
  };

  const handleRemoveWorktree = (id: string) => {
    engineRef.current?.removeWorktree(id);
  };

  return (
    <div className="w-screen h-screen relative">
      <ShiftspaceRenderer
        key={resetKey}
        initialWorktrees={engineRef.current.getWorktrees()}
        onEvent={onEvent}
        onDiffModeChange={handleDiffModeChange}
        onRequestBranchList={handleRequestBranchList}
        onViewModeChange={handleViewModeChange}
      />
      <ControlPanel
        engine={engineRef.current}
        worktreeIds={worktreeIds}
        onReset={handleReset}
        onAddWorktree={handleAddWorktree}
        onRemoveWorktree={handleRemoveWorktree}
      />
    </div>
  );
};
