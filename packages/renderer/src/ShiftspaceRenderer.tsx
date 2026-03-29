import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import type { WorktreeState, ShiftspaceEvent, DiffMode, ViewMode } from './types';
import { useShiftspaceStore } from './store';
import { TreeCanvas, type PanZoomConfig } from './TreeCanvas';
import { NODE_TYPES } from './components';
import { ViewModeSwitcher } from './components/ViewModeSwitcher';
import { SlimView } from './components/SlimView';
import { ListView } from './components/ListView';
import { computeSingleWorktreeLayout, type SingleWorktreeLayout } from './layout';
import { CONTAINER_GAP } from './layout/constants';
import type { LayoutNode } from './TreeCanvas';

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
  onViewModeChange?: (mode: ViewMode) => void;
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
  onViewModeChange,
  panZoomConfig,
}) => {
  const { worktrees, setWorktrees, applyEvent } = useShiftspaceStore();
  const actionConfigs = useShiftspaceStore((s) => s.actionConfigs);
  const viewMode = useShiftspaceStore((s) => s.viewMode);

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

  const { nodes, edges } = useMemo(() => {
    // Only compute canvas layout for tree mode — slim/list don't need it.
    if (viewMode === 'simple' || viewMode === 'list') {
      return { nodes: [], edges: [] };
    }

    const newCache = new Map<string, CacheEntry>();

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

    const allNodes: LayoutNode[] = [];
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
    viewMode,
    wtArray,
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
    <div className="w-full h-full bg-canvas relative">
      {/* Fixed mode switcher toolbar — top-right, outside canvas */}
      <div className="absolute top-3 right-3 z-10" style={{ pointerEvents: 'auto' }}>
        <ViewModeSwitcher onViewModeChange={onViewModeChange} />
      </div>

      {/* Content area */}
      {viewMode === 'simple' ? (
        <SlimView
          worktrees={wtArray}
          onDiffModeChange={stableDiffModeChange}
          onRequestBranchList={stableRequestBranchList}
          onCheckoutBranch={stableCheckoutBranch}
          onFetchBranches={stableFetchBranches}
          onSwapBranches={stableSwapBranches}
        />
      ) : viewMode === 'list' ? (
        <ListView
          worktrees={wtArray}
          onFileClick={stableFileClick}
          onDiffModeChange={stableDiffModeChange}
          onRequestBranchList={stableRequestBranchList}
          onCheckoutBranch={stableCheckoutBranch}
          onFetchBranches={stableFetchBranches}
          onSwapBranches={stableSwapBranches}
        />
      ) : (
        <TreeCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          panZoomConfig={panZoomConfig}
        />
      )}
    </div>
  );
};
