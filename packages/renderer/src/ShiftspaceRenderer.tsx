import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import type { WorktreeState, ShiftspaceEvent, DiffMode } from './types';
import { useShiftspaceStore } from './store';
import { type PanZoomConfig } from './TreeCanvas';
import { GroveView } from './components/GroveView';
import { InspectionView } from './components/InspectionView';
import { PackageSwitcher } from './components/PackageSwitcher';

interface Props {
  initialWorktrees?: WorktreeState[];
  onEvent?: (handler: (event: ShiftspaceEvent) => void) => () => void;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onTerminalOpen?: (worktreeId: string) => void;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFolderClick?: (worktreeId: string, folderPath: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onSetPackage?: (packageName: string) => void;
  onDetectPackages?: () => void;
  onGetLog?: (worktreeId: string, actionId: string) => void;
  panZoomConfig?: PanZoomConfig;
}

export { type PanZoomConfig };

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export const ShiftspaceRenderer: React.FC<Props> = ({
  initialWorktrees = [],
  onEvent,
  onFileClick,
  onDiffModeChange,
  onRequestBranchList,
  onCheckoutBranch,
  onFolderClick,
  onFetchBranches,
  onRunAction,
  onStopAction,
  onSwapBranches,
  onRunPipeline,
  onSetPackage,
  onDetectPackages,
  onGetLog,
  panZoomConfig,
}) => {
  const { worktrees, setWorktrees, applyEvent } = useShiftspaceStore();
  const mode = useShiftspaceStore((s) => s.mode);

  useEffect(() => {
    // Only seed the store when initialWorktrees was explicitly provided (preview app).
    // In the VSCode webview, the store is managed via message events — skipping this
    // prevents a remount (e.g. after an error→init sequence) from wiping fresh data.
    if (initialWorktrees.length > 0) setWorktrees(initialWorktrees);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onEvent) return;
    return onEvent(applyEvent);
  }, [onEvent, applyEvent]);

  // Stable callback refs
  const fileClickRef = useRef(onFileClick);
  fileClickRef.current = onFileClick;
  const stableFileClick = useCallback(
    (wtId: string, filePath: string) => fileClickRef.current?.(wtId, filePath),
    []
  );

  const diffModeChangeRef = useRef(onDiffModeChange);
  diffModeChangeRef.current = onDiffModeChange;
  const stableDiffModeChange = useCallback(
    (wtId: string, diffMode: DiffMode) => diffModeChangeRef.current?.(wtId, diffMode),
    []
  );

  const requestBranchListRef = useRef(onRequestBranchList);
  requestBranchListRef.current = onRequestBranchList;
  const stableRequestBranchList = useCallback(
    (wtId: string) => requestBranchListRef.current?.(wtId),
    []
  );

  const checkoutBranchRef = useRef(onCheckoutBranch);
  checkoutBranchRef.current = onCheckoutBranch;
  const stableCheckoutBranch = useCallback(
    (wtId: string, branch: string) => checkoutBranchRef.current?.(wtId, branch),
    []
  );

  const folderClickRef = useRef(onFolderClick);
  folderClickRef.current = onFolderClick;
  const stableFolderClick = useCallback(
    (wtId: string, folderPath: string) => folderClickRef.current?.(wtId, folderPath),
    []
  );

  const fetchBranchesRef = useRef(onFetchBranches);
  fetchBranchesRef.current = onFetchBranches;
  const stableFetchBranches = useCallback((wtId: string) => fetchBranchesRef.current?.(wtId), []);

  const runActionRef = useRef(onRunAction);
  runActionRef.current = onRunAction;
  const stableRunAction = useCallback(
    (wtId: string, actionId: string) => runActionRef.current?.(wtId, actionId),
    []
  );

  const stopActionRef = useRef(onStopAction);
  stopActionRef.current = onStopAction;
  const stableStopAction = useCallback(
    (wtId: string, actionId: string) => stopActionRef.current?.(wtId, actionId),
    []
  );

  const swapBranchesRef = useRef(onSwapBranches);
  swapBranchesRef.current = onSwapBranches;
  const stableSwapBranches = useCallback((wtId: string) => swapBranchesRef.current?.(wtId), []);

  const runPipelineRef = useRef(onRunPipeline);
  runPipelineRef.current = onRunPipeline;
  const stableRunPipeline = useCallback(
    (wtId: string, pipelineId: string) => runPipelineRef.current?.(wtId, pipelineId),
    []
  );

  const setPackageRef = useRef(onSetPackage);
  setPackageRef.current = onSetPackage;
  const stableSetPackage = useCallback((pkg: string) => setPackageRef.current?.(pkg), []);

  const detectPackagesRef = useRef(onDetectPackages);
  detectPackagesRef.current = onDetectPackages;
  const stableDetectPackages = useCallback(() => detectPackagesRef.current?.(), []);

  const getLogRef = useRef(onGetLog);
  getLogRef.current = onGetLog;
  const stableGetLog = useCallback(
    (wtId: string, actionId: string) => getLogRef.current?.(wtId, actionId),
    []
  );

  // Sorted worktree array (main/master first)
  const wtArray = useMemo(
    () =>
      Array.from(worktrees.values()).sort((a, b) => {
        if (a.isMainWorktree && !b.isMainWorktree) return -1;
        if (!a.isMainWorktree && b.isMainWorktree) return 1;
        return 0;
      }),
    [worktrees]
  );

  return (
    <div className="w-full h-full bg-canvas flex flex-col relative">
      {/* Global toolbar — only shown when package switching is wired up (VSCode extension) */}
      {onSetPackage && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-dashed shrink-0">
          <PackageSwitcher
            onSetPackage={stableSetPackage}
            onDetectPackages={stableDetectPackages}
          />
        </div>
      )}
      {/* Main content */}
      <div className="flex-1 min-h-0">
        {mode.type === 'grove' ? (
          <GroveView
            worktrees={wtArray}
            onRequestBranchList={stableRequestBranchList}
            onFetchBranches={stableFetchBranches}
            onCheckoutBranch={stableCheckoutBranch}
            onRunAction={stableRunAction}
            onStopAction={stableStopAction}
            onRunPipeline={stableRunPipeline}
          />
        ) : (
          <InspectionView
            worktreeId={mode.worktreeId}
            onFileClick={stableFileClick}
            onDiffModeChange={stableDiffModeChange}
            onRequestBranchList={stableRequestBranchList}
            onCheckoutBranch={stableCheckoutBranch}
            onFolderClick={stableFolderClick}
            onFetchBranches={stableFetchBranches}
            onRunAction={stableRunAction}
            onStopAction={stableStopAction}
            onSwapBranches={stableSwapBranches}
            onRunPipeline={stableRunPipeline}
            onGetLog={stableGetLog}
            panZoomConfig={panZoomConfig}
          />
        )}
      </div>
    </div>
  );
};
