import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import type { WorktreeState, ShiftspaceEvent, DiffMode } from './types';
import { useShiftspaceStore } from './store';
import { TreeCanvas, type PanZoomConfig } from './TreeCanvas';
import { NODE_TYPES } from './components';
import { computeSingleWorktreeLayout, type SingleWorktreeLayout } from './layout';
import { CONTAINER_GAP } from './layout/constants';

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
  const actionConfigs = useShiftspaceStore((s) => s.actionConfigs);

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

  // Per-worktree layout cache: reuse layout when WorktreeState reference is unchanged.
  type CacheEntry = { wtRef: WorktreeState; numActions: number; layout: SingleWorktreeLayout };
  const perLayoutCacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const numActions = actionConfigs.length;

  const { nodes, edges } = useMemo(() => {
    const newCache = new Map<string, CacheEntry>();
    const wtArray = Array.from(worktrees.values()).sort((a, b) => {
      const aIsMain = a.branch === 'main' || a.branch === 'master';
      const bIsMain = b.branch === 'main' || b.branch === 'master';
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
      return 0;
    });

    const perLayouts = wtArray.map((wt) => {
      const cached = perLayoutCacheRef.current.get(wt.id);
      const layout =
        cached && cached.wtRef === wt && cached.numActions === numActions
          ? cached.layout
          : computeSingleWorktreeLayout(
              wt,
              stableFileClick,
              stableDiffModeChange,
              stableRequestBranchList,
              stableCheckoutBranch,
              stableFolderClick,
              stableFetchBranches,
              stableRunAction,
              stableStopAction,
              numActions,
              stableSwapBranches
            );
      newCache.set(wt.id, { wtRef: wt, numActions, layout });
      return layout;
    });

    perLayoutCacheRef.current = newCache;

    const maxW = Math.max(...perLayouts.map((l) => l.containerW), 0);
    let cursorY = 0;

    const allNodes = [];
    const allEdges = [];

    for (const layout of perLayouts) {
      const offsetX = (maxW - layout.containerW) / 2;
      for (const n of layout.nodes) {
        allNodes.push({ ...n, position: { x: n.position.x + offsetX, y: n.position.y + cursorY } });
      }
      for (const e of layout.edges) allEdges.push(e);
      cursorY += layout.containerH + CONTAINER_GAP;
    }

    return { nodes: allNodes, edges: allEdges };
  }, [
    worktrees,
    numActions,
    stableFileClick,
    stableDiffModeChange,
    stableRequestBranchList,
    stableCheckoutBranch,
    stableFolderClick,
    stableFetchBranches,
    stableRunAction,
    stableStopAction,
    stableSwapBranches,
  ]);

  return (
    <div className="w-full h-full bg-canvas">
      <TreeCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        panZoomConfig={panZoomConfig}
      />
    </div>
  );
};
