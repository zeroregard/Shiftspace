import type { WorktreeState } from '../types';
import type { LayoutNode, LayoutEdge } from '../TreeCanvas';
import { buildTree } from './tree';
import { layoutWorktreeContents } from './algorithm';
import { flattenRect } from './flatten';
import type { WorktreeNodeData } from './flatten';
import {
  WT_HEADER_H,
  CONTAINER_PAD_X,
  CONTAINER_PAD_TOP,
  CONTAINER_PAD_BOTTOM,
  CONTAINER_GAP,
} from './constants';

export interface SingleWorktreeLayout {
  nodes: LayoutNode[]; // positioned relative to x=0 for this worktree
  edges: LayoutEdge[];
  containerW: number;
  containerH: number;
}

/** Compute layout for a single worktree, with all nodes positioned from x=0. */
export function computeSingleWorktreeLayout(
  wt: WorktreeState,
  onFileClick?: (worktreeId: string, filePath: string) => void
): SingleWorktreeLayout {
  const treeChildren = buildTree(wt.id, wt.files);
  const contentsStartY = WT_HEADER_H + CONTAINER_PAD_TOP;
  const { layouts, totalW, totalH } = layoutWorktreeContents(treeChildren, contentsStartY);
  const containerW = totalW + CONTAINER_PAD_X * 2;
  const containerH = contentsStartY + totalH + CONTAINER_PAD_BOTTOM;
  const wtNodeId = `wt-${wt.id}`;

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const data: WorktreeNodeData = { worktree: wt };
  nodes.push({
    id: wtNodeId,
    type: 'worktreeNode',
    position: { x: 0, y: 0 },
    width: containerW,
    height: containerH,
    data,
  });

  const contentsOffsetX = (containerW - totalW) / 2;
  for (const layout of layouts) {
    flattenRect(layout, wtNodeId, true, contentsOffsetX, 0, wt.id, onFileClick, nodes, edges);
  }

  return { nodes, edges, containerW, containerH };
}

export function computeFullLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const perLayouts = wtArray.map((wt) => ({
    wt,
    layout: computeSingleWorktreeLayout(wt, onFileClick),
  }));

  const totalWidth = perLayouts.reduce(
    (sum, wl, i) => sum + wl.layout.containerW + (i > 0 ? CONTAINER_GAP : 0),
    0
  );
  const startX = -totalWidth / 2;

  let cursorX = startX;
  const allNodes: LayoutNode[] = [];
  const allEdges: LayoutEdge[] = [];

  for (const { layout } of perLayouts) {
    for (const n of layout.nodes) {
      allNodes.push({ ...n, position: { x: n.position.x + cursorX, y: n.position.y } });
    }
    for (const e of layout.edges) allEdges.push(e);
    cursorX += layout.containerW + CONTAINER_GAP;
  }

  return { nodes: allNodes, edges: allEdges };
}
