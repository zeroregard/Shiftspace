import type { WorktreeState } from '../types';
import type { LayoutNode, LayoutEdge } from '../tree-canvas';
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
  computeFileNodeHeight,
} from './config';

interface SingleWorktreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  containerW: number;
  containerH: number;
}

interface SingleWorktreeLayoutOptions {
  bare?: boolean;
  filesOverride?: import('../types').FileChange[];
}

/** Compute layout for a single worktree, with all nodes positioned from x=0. */
export function computeSingleWorktreeLayout(
  wt: WorktreeState,
  options?: SingleWorktreeLayoutOptions,
  getFileAnnotationRows?: (worktreeId: string, filePath: string) => number
): SingleWorktreeLayout {
  const files = options?.filesOverride ?? wt.files;
  const treeChildren = buildTree(wt.id, files);
  const contentsStartY = WT_HEADER_H + CONTAINER_PAD_TOP;
  const getFileH = getFileAnnotationRows
    ? (path: string) => computeFileNodeHeight(getFileAnnotationRows(wt.id, path))
    : undefined;
  const { layouts, totalW, totalH } = layoutWorktreeContents(
    treeChildren,
    contentsStartY,
    getFileH
  );

  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
  const headerText = wt.isMainWorktree ? wt.branch : `${folderName} (${wt.branch})`;
  const headerMinW = headerText.length * 8 + CONTAINER_PAD_X * 2;
  const containerW = Math.max(totalW + CONTAINER_PAD_X * 2, headerMinW);
  const containerH = contentsStartY + totalH + CONTAINER_PAD_BOTTOM;
  const wtNodeId = `wt-${wt.id}`;

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const data: WorktreeNodeData = {
    worktree: wt,
    bare: options?.bare,
  };
  nodes.push({
    id: wtNodeId,
    type: 'worktreeNode',
    position: { x: 0, y: 0 },
    width: containerW,
    height: containerH,
    label: headerText,
    data,
  });

  const contentsOffsetX = (containerW - totalW) / 2;
  for (const layout of layouts) {
    flattenRect({
      rect: layout,
      parentId: wtNodeId,
      isRootChild: true,
      offsetX: contentsOffsetX,
      offsetY: 0,
      wtId: wt.id,
      nodes,
      edges,
      getFileH,
    });
  }

  return { nodes, edges, containerW, containerH };
}

export function computeFullLayout(wtArray: WorktreeState[]): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
} {
  const perLayouts = wtArray.map((wt) => computeSingleWorktreeLayout(wt));

  const totalGroupW =
    perLayouts.reduce((sum, l) => sum + l.containerW, 0) +
    Math.max(perLayouts.length - 1, 0) * CONTAINER_GAP;

  let cursorX = -totalGroupW / 2;

  const allNodes: LayoutNode[] = [];
  const allEdges: LayoutEdge[] = [];

  for (const layout of perLayouts) {
    for (const n of layout.nodes) {
      allNodes.push({ ...n, position: { x: n.position.x + cursorX, y: n.position.y } });
    }
    for (const e of layout.edges) allEdges.push(e);
    cursorX += layout.containerW + CONTAINER_GAP;
  }

  return { nodes: allNodes, edges: allEdges };
}
