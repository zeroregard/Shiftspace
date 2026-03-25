import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import type { WorktreeState, ShiftspaceEvent } from './types';
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
  panZoomConfig?: PanZoomConfig;
}

export { type PanZoomConfig };

export const ShiftspaceRenderer: React.FC<Props> = ({
  initialWorktrees = [],
  onEvent,
  onFileClick,
  panZoomConfig,
}) => {
  const { worktrees, setWorktrees, applyEvent } = useShiftspaceStore();

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

  // Per-worktree layout cache: reuse layout when WorktreeState reference is unchanged.
  type CacheEntry = { wtRef: WorktreeState; layout: SingleWorktreeLayout };
  const perLayoutCacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const { nodes, edges } = useMemo(() => {
    const newCache = new Map<string, CacheEntry>();
    const wtArray = Array.from(worktrees.values());

    const perLayouts = wtArray.map((wt) => {
      const cached = perLayoutCacheRef.current.get(wt.id);
      const layout =
        cached && cached.wtRef === wt
          ? cached.layout
          : computeSingleWorktreeLayout(wt, stableFileClick);
      newCache.set(wt.id, { wtRef: wt, layout });
      return layout;
    });

    perLayoutCacheRef.current = newCache;

    const totalWidth = perLayouts.reduce(
      (sum, l, i) => sum + l.containerW + (i > 0 ? CONTAINER_GAP : 0),
      0
    );
    let cursorX = -totalWidth / 2;

    const allNodes = [];
    const allEdges = [];

    for (const layout of perLayouts) {
      for (const n of layout.nodes) {
        allNodes.push({ ...n, position: { x: n.position.x + cursorX, y: n.position.y } });
      }
      for (const e of layout.edges) allEdges.push(e);
      cursorX += layout.containerW + CONTAINER_GAP;
    }

    return { nodes: allNodes, edges: allEdges };
  }, [worktrees, stableFileClick]);

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
