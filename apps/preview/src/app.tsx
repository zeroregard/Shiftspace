import React, { useEffect, useRef, useState } from 'react';
import '@vscode/codicons/dist/codicon.css';
import {
  ShiftspaceRenderer,
  useActionStore,
  useInsightStore,
  usePackageStore,
} from '@shiftspace/renderer';
import type { ShiftspaceEvent } from '@shiftspace/renderer';
import { MockEngine } from './mock/engine';
import { MOCK_ACTION_CONFIGS, MOCK_PIPELINES, getMockInitialStates } from './mock/actions';
import { ControlPanel } from './controls/control-panel';
import {
  MOCK_CODE_SMELL_DETAIL_WT0,
  MOCK_CODE_SMELL_DETAIL_WT1,
  MOCK_DIAGNOSTICS_WT0,
  MOCK_DIAGNOSTICS_WT1,
} from './mock-data';
import { useSimulationHandlers } from './use-simulation-handlers';
import { useTheme } from './use-theme';

export const App: React.FC = () => {
  const engineRef = useRef<MockEngine | null>(null);
  const [worktreeIds, setWorktreeIds] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const theme = useTheme();

  const { setActionConfigs, setPipelines, setActionState } = useActionStore();
  const { setInsightDetail, setFileDiagnostics } = useInsightStore();
  const { setSelectedPackage, setAvailablePackages } = usePackageStore();

  if (!engineRef.current) {
    engineRef.current = new MockEngine();
  }

  const {
    handleDiffModeChange,
    handleRequestBranchList,
    handleRunAction,
    handleStopAction,
    handleRunPipeline,
    handleRecheckInsights,
    handleRenameWorktree,
    cleanupSimulations,
  } = useSimulationHandlers(engineRef);

  // Initialize mock action configs and pipelines once on mount / reset
  useEffect(() => {
    setActionConfigs(MOCK_ACTION_CONFIGS);
    setPipelines(MOCK_PIPELINES);
  }, [resetKey, setActionConfigs, setPipelines]);

  useEffect(() => {
    const engine = engineRef.current!;
    const initialWorktrees = engine.getWorktrees();
    setWorktreeIds(initialWorktrees.map((wt) => wt.id));

    for (const wt of initialWorktrees) {
      for (const { actionId, state } of getMockInitialStates(wt.id)) {
        setActionState(wt.id, actionId, state);
      }
    }

    if (initialWorktrees[0]) {
      setInsightDetail('wt-0', 'codeSmells', MOCK_CODE_SMELL_DETAIL_WT0);
      setFileDiagnostics('wt-0', MOCK_DIAGNOSTICS_WT0);
    }
    if (initialWorktrees[1]) {
      setInsightDetail('wt-1', 'codeSmells', MOCK_CODE_SMELL_DETAIL_WT1);
      setFileDiagnostics('wt-1', MOCK_DIAGNOSTICS_WT1);
    }

    const unsub = engine.subscribe((event: ShiftspaceEvent) => {
      if (event.type === 'worktree-added') {
        setWorktreeIds((ids) => [...ids, event.worktree.id]);
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
  }, [resetKey, setActionState, setInsightDetail, setFileDiagnostics]);

  // Cleanup simulations on unmount
  useEffect(() => {
    return () => {
      cleanupSimulations();
      engineRef.current?.destroy();
    };
  }, [cleanupSimulations]);

  const onEvent = (handler: (event: ShiftspaceEvent) => void) => {
    return engineRef.current!.subscribe(handler);
  };

  const handleReset = () => {
    cleanupSimulations();
    engineRef.current?.reset();
    setResetKey((k) => k + 1);
  };

  const MOCK_PACKAGES = [
    '@shiftspace/renderer',
    '@shiftspace/renderer-core',
    '@shiftspace/renderer-grove',
    '@shiftspace/renderer-inspection',
    '@shiftspace/ui',
    '@shiftspace/preview',
    '@shiftspace/vscode-ext',
  ];

  const handleSetPackage = (packageName: string) => {
    setSelectedPackage(packageName);
  };

  const handleDetectPackages = () => {
    setAvailablePackages(MOCK_PACKAGES);
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
        onRecheckInsights={handleRecheckInsights}
        onRenameWorktree={handleRenameWorktree}
        onSetPackage={handleSetPackage}
        onDetectPackages={handleDetectPackages}
        onAddWorktree={handleAddWorktree}
        onRemoveWorktree={handleRemoveWorktree}
      />
      <ControlPanel
        engine={engineRef.current}
        worktreeIds={worktreeIds}
        onReset={handleReset}
        onAddWorktree={handleAddWorktree}
        onRemoveWorktree={handleRemoveWorktree}
        resolvedTheme={theme.resolved}
        onToggleTheme={theme.cycle}
      />
    </div>
  );
};
