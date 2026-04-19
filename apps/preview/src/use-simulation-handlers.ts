import React, { useRef } from 'react';
import {
  useWorktreeStore,
  useActionStore,
  useInsightStore,
  useOperationStore,
  opKey,
} from '@shiftspace/renderer';
import type { DiffMode } from '@shiftspace/renderer';
import type { MockEngine } from './mock/engine';
import {
  MOCK_ACTION_CONFIGS,
  MOCK_PIPELINES,
  simulateCheck,
  simulatePipeline,
} from './mock/actions';
import {
  MOCK_CODE_SMELL_DETAIL_WT0,
  MOCK_CODE_SMELL_DETAIL_WT1,
  MOCK_DIAGNOSTICS_WT0,
  MOCK_DIAGNOSTICS_WT1,
} from './mock-data';

export function useSimulationHandlers(engineRef: React.RefObject<MockEngine | null>) {
  const activeSimulations = useRef<Map<string, () => void>>(new Map());

  const { updateWorktreeFiles } = useWorktreeStore();
  const { setActionState } = useActionStore();
  const { setInsightDetail, setFileDiagnostics } = useInsightStore();
  const { startOperation, clearOperation } = useOperationStore();

  const handleDiffModeChange = (worktreeId: string, diffMode: DiffMode) => {
    const opId = opKey.diffMode(worktreeId);
    startOperation(opId, worktreeId);
    setTimeout(() => {
      const engine = engineRef.current;
      if (!engine) {
        clearOperation(opId);
        return;
      }
      if (diffMode.type === 'working') {
        updateWorktreeFiles(worktreeId, engine.getMockWorkingFiles(worktreeId), diffMode);
      } else if (diffMode.type === 'repo') {
        updateWorktreeFiles(worktreeId, [], diffMode, engine.getMockRepoFiles(worktreeId));
      } else {
        updateWorktreeFiles(
          worktreeId,
          engine.getMockWorkingFiles(worktreeId),
          diffMode,
          engine.getMockBranchFiles(worktreeId)
        );
      }
      clearOperation(opId);
    }, 200);
  };

  const handleRunAction = (worktreeId: string, actionId: string) => {
    const config = MOCK_ACTION_CONFIGS.find((a) => a.id === actionId);
    if (!config) return;
    const key = `${worktreeId}:${actionId}`;
    if (config.type === 'service') {
      setActionState(worktreeId, actionId, { status: 'running', port: 5173 });
      return;
    }
    activeSimulations.current.get(key)?.();
    const cancel = simulateCheck(worktreeId, actionId, setActionState);
    activeSimulations.current.set(key, cancel);
  };

  const handleStopAction = (worktreeId: string, actionId: string) => {
    const key = `${worktreeId}:${actionId}`;
    activeSimulations.current.get(key)?.();
    activeSimulations.current.delete(key);
    setActionState(worktreeId, actionId, { status: 'stopped' });
  };

  const handleRunPipeline = (worktreeId: string, pipelineId: string) => {
    const pipelineKey = `${worktreeId}:pipeline:${pipelineId}`;
    activeSimulations.current.get(pipelineKey)?.();
    const cancel = simulatePipeline(worktreeId, pipelineId, MOCK_PIPELINES, setActionState);
    activeSimulations.current.set(pipelineKey, cancel);
  };

  const handleRecheckInsights = (worktreeId: string) => {
    startOperation(opKey.runInsights);
    setTimeout(() => {
      if (worktreeId === 'wt-0') {
        setInsightDetail('wt-0', 'codeSmells', MOCK_CODE_SMELL_DETAIL_WT0);
        setFileDiagnostics('wt-0', MOCK_DIAGNOSTICS_WT0);
      } else if (worktreeId === 'wt-1') {
        setInsightDetail('wt-1', 'codeSmells', MOCK_CODE_SMELL_DETAIL_WT1);
        setFileDiagnostics('wt-1', MOCK_DIAGNOSTICS_WT1);
      }
      clearOperation(opKey.runInsights);
    }, 600);
  };

  const cleanupSimulations = () => {
    for (const cancel of activeSimulations.current.values()) cancel();
    activeSimulations.current.clear();
  };

  return {
    activeSimulations,
    handleDiffModeChange,
    handleRunAction,
    handleStopAction,
    handleRunPipeline,
    handleRecheckInsights,
    cleanupSimulations,
  };
}
