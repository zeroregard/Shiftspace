import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import type { WorktreeState, ShiftspaceEvent, DiffMode } from './types';
import { useShiftspaceStore } from './store';
import { type PanZoomConfig } from './TreeCanvas';
import { GroveView } from './components/GroveView';
import { InspectionView } from './components/InspectionView';

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
    <div className="w-full h-full bg-canvas relative">
      {mode.type === 'grove' ? (
        <GroveView
          worktrees={wtArray}
          onDiffModeChange={stableDiffModeChange}
          onRequestBranchList={stableRequestBranchList}
          onFetchBranches={stableFetchBranches}
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
          panZoomConfig={panZoomConfig}
        />
      )}
    </div>
  );
};
