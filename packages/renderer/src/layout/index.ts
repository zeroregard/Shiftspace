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
  computeFileNodeHeight,
} from './config';

export interface SingleWorktreeLayout {
  nodes: LayoutNode[]; // positioned relative to x=0 for this worktree
  edges: LayoutEdge[];
  containerW: number;
  containerH: number;
}

export interface SingleWorktreeLayoutOptions {
  /** When true, the worktree container renders without border, background, or header. */
  bare?: boolean;
  /** Override the file list used for building the tree (e.g. to include branch diff files). */
  filesOverride?: import('../types').FileChange[];
}

/** Compute layout for a single worktree, with all nodes positioned from x=0. */
export function computeSingleWorktreeLayout(
  wt: WorktreeState,
  onFileClick?: (worktreeId: string, filePath: string) => void,
  onRequestBranchList?: (worktreeId: string) => void,
  onCheckoutBranch?: (worktreeId: string, branch: string) => void,
  onFolderClick?: (worktreeId: string, folderPath: string) => void,
  onFetchBranches?: (worktreeId: string) => void,
  onSwapBranches?: (worktreeId: string) => void,
  options?: SingleWorktreeLayoutOptions,
  getFileFindingsCount?: (worktreeId: string, filePath: string) => number
): SingleWorktreeLayout {
  const files = options?.filesOverride ?? wt.files;
  const treeChildren = buildTree(wt.id, files);
  const contentsStartY = WT_HEADER_H + CONTAINER_PAD_TOP;
  const getFileH = getFileFindingsCount
    ? (path: string) => computeFileNodeHeight(getFileFindingsCount(wt.id, path))
    : undefined;
  const { layouts, totalW, totalH } = layoutWorktreeContents(
    treeChildren,
    contentsStartY,
    getFileH
  );

  // Ensure the container is wide enough to fit the header label.
  // Estimate: ~8px per character at text-13 semibold + padding.
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
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onSwapBranches,
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
    flattenRect(
      layout,
      wtNodeId,
      true,
      contentsOffsetX,
      0,
      wt.id,
      onFileClick,
      nodes,
      edges,
      false,
      onFolderClick,
      getFileH
    );
  }

  return { nodes, edges, containerW, containerH };
}

export function computeFullLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void,
  onRequestBranchList?: (worktreeId: string) => void,
  onCheckoutBranch?: (worktreeId: string, branch: string) => void,
  onFolderClick?: (worktreeId: string, folderPath: string) => void,
  onFetchBranches?: (worktreeId: string) => void,
  onSwapBranches?: (worktreeId: string) => void
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const perLayouts = wtArray.map((wt) =>
    computeSingleWorktreeLayout(
      wt,
      onFileClick,
      onRequestBranchList,
      onCheckoutBranch,
      onFolderClick,
      onFetchBranches,
      onSwapBranches
    )
  );

  // Lay worktrees out horizontally, side-by-side, top-aligned.
  // Center the entire group around x = 0.
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
