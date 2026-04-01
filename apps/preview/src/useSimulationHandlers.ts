import { useRef, useCallback } from 'react';
import { useShiftspaceStore } from '@shiftspace/renderer';
import type { DiffMode } from '@shiftspace/renderer';
import type { MockEngine } from './mock/engine';
import { MOCK_BRANCHES } from './mock/engine';
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
} from './mockData';

export function useSimulationHandlers(engineRef: React.RefObject<MockEngine | null>) {
  const activeSimulations = useRef<Map<string, () => void>>(new Map());

  const {
    updateWorktreeFiles,
    setDiffModeLoading,
    setBranchList,
    setActionState,
    setInsightDetail,
    setFileDiagnostics,
  } = useShiftspaceStore();

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
    [engineRef, setDiffModeLoading, updateWorktreeFiles]
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
        setActionState(worktreeId, actionId, { status: 'running', port: 5173 });
        return;
      }
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

  const handleRecheckInsights = useCallback(
    (worktreeId: string) => {
      if (worktreeId === 'wt-0') {
        setInsightDetail('wt-0', 'codeSmells', MOCK_CODE_SMELL_DETAIL_WT0);
        setFileDiagnostics('wt-0', MOCK_DIAGNOSTICS_WT0);
      } else if (worktreeId === 'wt-1') {
        setInsightDetail('wt-1', 'codeSmells', MOCK_CODE_SMELL_DETAIL_WT1);
        setFileDiagnostics('wt-1', MOCK_DIAGNOSTICS_WT1);
      }
    },
    [setInsightDetail, setFileDiagnostics]
  );

  const cleanupSimulations = () => {
    for (const cancel of activeSimulations.current.values()) cancel();
    activeSimulations.current.clear();
  };

  return {
    activeSimulations,
    handleDiffModeChange,
    handleRequestBranchList,
    handleRunAction,
    handleStopAction,
    handleRunPipeline,
    handleRecheckInsights,
    cleanupSimulations,
  };
}
