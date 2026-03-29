import React, { useEffect, useRef, useState, useCallback } from 'react';
import '@vscode/codicons/dist/codicon.css';
import { ShiftspaceRenderer, useShiftspaceStore } from '@shiftspace/renderer';
import type { ShiftspaceEvent, DiffMode } from '@shiftspace/renderer';
import { MockEngine, MOCK_BRANCHES } from './mock/engine';
import {
  MOCK_ACTION_CONFIGS,
  MOCK_PIPELINES,
  getMockInitialStates,
  simulateCheck,
  simulatePipeline,
} from './mock/actions';
import { ControlPanel } from './controls/ControlPanel';

export const App: React.FC = () => {
  const engineRef = useRef<MockEngine | null>(null);
  const [worktreeIds, setWorktreeIds] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  // Track active simulation cancel functions to clean up on unmount / re-run
  const activeSimulations = useRef<Map<string, () => void>>(new Map());

  const {
    updateWorktreeFiles,
    setDiffModeLoading,
    setBranchList,
    setActionConfigs,
    setPipelines,
    setActionState,
  } = useShiftspaceStore();

  if (!engineRef.current) {
    engineRef.current = new MockEngine();
  }

  // Initialize mock action configs and pipelines once on mount / reset
  useEffect(() => {
    setActionConfigs(MOCK_ACTION_CONFIGS);
    setPipelines(MOCK_PIPELINES);
  }, [resetKey, setActionConfigs, setPipelines]);

  useEffect(() => {
    const engine = engineRef.current!;
    const initialWorktrees = engine.getWorktrees();
    setWorktreeIds(initialWorktrees.map((wt) => wt.id));

    // Seed initial action states for already-existing worktrees
    for (const wt of initialWorktrees) {
      for (const { actionId, state } of getMockInitialStates(wt.id)) {
        setActionState(wt.id, actionId, state);
      }
    }

    const unsub = engine.subscribe((event: ShiftspaceEvent) => {
      if (event.type === 'worktree-added') {
        setWorktreeIds((ids) => [...ids, event.worktree.id]);
        // Seed initial states for the new worktree
        for (const { actionId, state } of getMockInitialStates(event.worktree.id)) {
          setActionState(event.worktree.id, actionId, state);
        }
      } else if (event.type === 'worktree-removed') {
        setWorktreeIds((ids) => ids.filter((id) => id !== event.worktreeId));
      }
    });

    return () => {
      unsub();
    };
  }, [resetKey, setActionState]);

  // Cleanup simulations on unmount
  useEffect(() => {
    return () => {
      for (const cancel of activeSimulations.current.values()) cancel();
      activeSimulations.current.clear();
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
      setDiffModeLoading(worktreeId, true);

      setTimeout(() => {
        const engine = engineRef.current;
        if (!engine) return;

        if (diffMode.type === 'working') {
          updateWorktreeFiles(worktreeId, engine.getMockWorkingFiles(worktreeId), diffMode);
        } else {
          updateWorktreeFiles(
            worktreeId,
            engine.getMockWorkingFiles(worktreeId),
            diffMode,
            engine.getMockBranchFiles(worktreeId)
          );
        }
      }, 200);
    },
    [setDiffModeLoading, updateWorktreeFiles]
  );

  const handleRequestBranchList = useCallback(
    (worktreeId: string) => {
      setBranchList(worktreeId, MOCK_BRANCHES);
    },
    [setBranchList]
  );

  const handleRunAction = useCallback(
    (worktreeId: string, actionId: string) => {
      const config = MOCK_ACTION_CONFIGS.find((a) => a.id === actionId);
      if (!config) return;

      const key = `${worktreeId}:${actionId}`;

      if (config.type === 'service') {
        // Toggle: if already running, do nothing (stop handles that)
        setActionState(worktreeId, actionId, { status: 'running', port: 5173 });
        return;
      }

      // Cancel any existing simulation for this action
      activeSimulations.current.get(key)?.();

      const cancel = simulateCheck(worktreeId, actionId, setActionState);
      activeSimulations.current.set(key, cancel);
    },
    [setActionState]
  );

  const handleStopAction = useCallback(
    (worktreeId: string, actionId: string) => {
      const key = `${worktreeId}:${actionId}`;
      activeSimulations.current.get(key)?.();
      activeSimulations.current.delete(key);
      setActionState(worktreeId, actionId, { status: 'stopped' });
    },
    [setActionState]
  );

  const handleRunPipeline = useCallback(
    (worktreeId: string, pipelineId: string) => {
      const pipelineKey = `${worktreeId}:pipeline:${pipelineId}`;
      activeSimulations.current.get(pipelineKey)?.();

      const cancel = simulatePipeline(worktreeId, pipelineId, MOCK_PIPELINES, setActionState);
      activeSimulations.current.set(pipelineKey, cancel);
    },
    [setActionState]
  );

  const handleReset = () => {
    for (const cancel of activeSimulations.current.values()) cancel();
    activeSimulations.current.clear();
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
        onRunAction={handleRunAction}
        onStopAction={handleStopAction}
        onRunPipeline={handleRunPipeline}
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
