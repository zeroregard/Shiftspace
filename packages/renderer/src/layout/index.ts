import type { WorktreeState, DiffMode } from '../types';
import type { LayoutNode, LayoutEdge } from '../TreeCanvas';
import { buildTree } from './tree';
import { layoutWorktreeContents } from './algorithm';
import { flattenRect } from './flatten';
import type { WorktreeNodeData } from './flatten';
import {
  WT_HEADER_H,
  ACTION_BAR_H,
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
  onFileClick?: (worktreeId: string, filePath: string) => void,
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void,
  onRequestBranchList?: (worktreeId: string) => void,
  onCheckoutBranch?: (worktreeId: string, branch: string) => void,
  onFolderClick?: (worktreeId: string, folderPath: string) => void,
  onFetchBranches?: (worktreeId: string) => void,
  onRunAction?: (worktreeId: string, actionId: string) => void,
  onStopAction?: (worktreeId: string, actionId: string) => void,
  numActions?: number
): SingleWorktreeLayout {
  const treeChildren = buildTree(wt.id, wt.files);
  const actionBarH = (numActions ?? 0) > 0 ? ACTION_BAR_H : 0;
  const contentsStartY = WT_HEADER_H + CONTAINER_PAD_TOP + actionBarH;
  const { layouts, totalW, totalH } = layoutWorktreeContents(treeChildren, contentsStartY);

  // Ensure the container is wide enough to fit the header label + diff mode button.
  // Estimate: ~8px per character at text-13 semibold + padding + ~120px for the diff mode button.
  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
  const isMain = wt.branch === 'main' || wt.branch === 'master';
  const headerText = isMain ? wt.branch : `${folderName} (${wt.branch})`;
  const DIFF_MODE_BUTTON_W = 120;
  const headerMinW = headerText.length * 8 + CONTAINER_PAD_X * 2 + DIFF_MODE_BUTTON_W;
  const containerW = Math.max(totalW + CONTAINER_PAD_X * 2, headerMinW);
  const containerH = contentsStartY + totalH + CONTAINER_PAD_BOTTOM;
  const wtNodeId = `wt-${wt.id}`;

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const data: WorktreeNodeData = {
    worktree: wt,
    onDiffModeChange,
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onRunAction,
    onStopAction,
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
      onFolderClick
    );
  }

  return { nodes, edges, containerW, containerH };
}

export function computeFullLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void,
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void,
  onRequestBranchList?: (worktreeId: string) => void,
  onCheckoutBranch?: (worktreeId: string, branch: string) => void,
  onFolderClick?: (worktreeId: string, folderPath: string) => void,
  onFetchBranches?: (worktreeId: string) => void,
  onRunAction?: (worktreeId: string, actionId: string) => void,
  onStopAction?: (worktreeId: string, actionId: string) => void,
  numActions?: number
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const perLayouts = wtArray.map((wt) => ({
    wt,
    layout: computeSingleWorktreeLayout(
      wt,
      onFileClick,
      onDiffModeChange,
      onRequestBranchList,
      onCheckoutBranch,
      onFolderClick,
      onFetchBranches,
      onRunAction,
      onStopAction,
      numActions
    ),
  }));

  const maxW = Math.max(...perLayouts.map((wl) => wl.layout.containerW), 0);
  let cursorY = 0;

  const allNodes: LayoutNode[] = [];
  const allEdges: LayoutEdge[] = [];

  for (const { layout } of perLayouts) {
    const offsetX = (maxW - layout.containerW) / 2;
    for (const n of layout.nodes) {
      allNodes.push({ ...n, position: { x: n.position.x + offsetX, y: n.position.y + cursorY } });
    }
    for (const e of layout.edges) allEdges.push(e);
    cursorY += layout.containerH + CONTAINER_GAP;
  }

  return { nodes: allNodes, edges: allEdges };
}
