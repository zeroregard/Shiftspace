import React, { useEffect, useRef, useState } from 'react';
import '@vscode/codicons/dist/codicon.css';
import {
  SidebarView,
  useActionStore,
  useInsightStore,
  useWorktreeStore,
  ActionsProvider,
  TooltipProvider,
} from '@shiftspace/renderer';
import type { ShiftspaceEvent } from '@shiftspace/renderer';
import { MockEngine } from './mock/engine';
import { MockGitProvider } from './mock/mock-git-provider';
import { MockWebviewBridge } from './mock/mock-webview-bridge';
import { MOCK_ACTION_CONFIGS, MOCK_PIPELINES, getMockInitialStates } from './mock/actions';
import {
  MOCK_CODE_SMELL_DETAIL_WT0,
  MOCK_CODE_SMELL_DETAIL_WT1,
  MOCK_DIAGNOSTICS_WT0,
  MOCK_DIAGNOSTICS_WT1,
} from './mock-data';
import { useSimulationHandlers } from './use-simulation-handlers';

export const SidebarPage: React.FC = () => {
  const engineRef = useRef<MockEngine | null>(null);
  const bridgeRef = useRef<MockWebviewBridge | null>(null);
  const [_worktreeIds, setWorktreeIds] = useState<string[]>([]);

  const { setActionConfigs, setPipelines, setActionState } = useActionStore();
  const { setInsightDetail, setFileDiagnostics } = useInsightStore();
  const { setWorktrees, applyEvent } = useWorktreeStore();

  if (!engineRef.current) {
    engineRef.current = new MockEngine();
  }
  if (!bridgeRef.current) {
    bridgeRef.current = new MockWebviewBridge(new MockGitProvider({ engine: engineRef.current }));
    bridgeRef.current.installTestHook();
  }

  const {
    handleDiffModeChange,
    handleRunAction,
    handleStopAction,
    handleRunPipeline,
    handleRecheckInsights,
    cleanupSimulations,
  } = useSimulationHandlers(engineRef);

  const handleRequestBranchList = (worktreeId: string) => {
    bridgeRef.current?.postMessage({ type: 'get-branch-list', worktreeId });
  };
  const handleRenameWorktree = (worktreeId: string, newName: string) => {
    bridgeRef.current?.postMessage({ type: 'rename-worktree', worktreeId, newName });
  };

  useEffect(() => {
    setActionConfigs(MOCK_ACTION_CONFIGS);
    setPipelines(MOCK_PIPELINES);
  }, [setActionConfigs, setPipelines]);

  useEffect(() => {
    const engine = engineRef.current!;
    const initialWorktrees = engine.getWorktrees();
    setWorktreeIds(initialWorktrees.map((wt) => wt.id));
    setWorktrees(initialWorktrees);

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
      applyEvent(event);
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
  }, [setActionState, setInsightDetail, setFileDiagnostics, setWorktrees, applyEvent]);

  useEffect(() => {
    return () => {
      cleanupSimulations();
      engineRef.current?.destroy();
    };
  }, [cleanupSimulations]);

  const worktrees = useWorktreeStore((s) => s.worktrees);
  const wtArray = Array.from(worktrees.values());

  const handleAddWorktree = () => {
    bridgeRef.current?.postMessage({ type: 'add-worktree' });
  };

  return (
    <ActionsProvider
      onDiffModeChange={handleDiffModeChange}
      onRequestBranchList={handleRequestBranchList}
      onRunAction={handleRunAction}
      onStopAction={handleStopAction}
      onRunPipeline={handleRunPipeline}
      onRecheckInsights={handleRecheckInsights}
      onRenameWorktree={handleRenameWorktree}
      onAddWorktree={handleAddWorktree}
    >
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <div className="w-80 h-screen bg-canvas" data-mode="sidebar">
          <SidebarView
            worktrees={wtArray}
            onWorktreeClick={() => {
              /* In VSCode, this opens/focuses a Shiftspace tab */
            }}
          />
        </div>
      </TooltipProvider>
    </ActionsProvider>
  );
};
