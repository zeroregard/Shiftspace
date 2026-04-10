import type { LayoutRect } from './algorithm';
import type { LayoutNode, LayoutEdge } from '../tree-canvas';
import type { FileChange } from '../types';
import { FILE_NODE_W, FILE_NODE_BASE_H, FOLDER_NODE_W, FOLDER_NODE_H } from './config';

export interface WorktreeNodeData {
  worktree: import('../types').WorktreeState;
  bare?: boolean;
  [key: string]: unknown;
}

export interface FolderNodeData {
  name: string;
  folderPath: string;
  worktreeId: string;
  [key: string]: unknown;
}

interface FileNodeData {
  file: FileChange;
  worktreeId: string;
  [key: string]: unknown;
}

interface FlattenOpts {
  rect: LayoutRect;
  parentId: string | null;
  isRootChild: boolean;
  offsetX: number;
  offsetY: number;
  wtId: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  suppressEdge?: boolean;
  getFileH?: (filePath: string) => number;
}

export function flattenRect(opts: FlattenOpts) {
  const { rect, parentId, isRootChild, offsetX, offsetY, wtId, nodes, edges, getFileH } = opts;
  const suppressEdge = opts.suppressEdge ?? false;
  const absX = offsetX + rect.x;
  const absY = offsetY + rect.y;
  const isFile = rect.node.kind === 'file';
  const file = rect.node.file;

  if (isFile && file) {
    const data: FileNodeData = { file, worktreeId: wtId };
    nodes.push({
      id: rect.node.id,
      type: 'fileNode',
      position: { x: absX, y: absY },
      width: FILE_NODE_W,
      height: getFileH?.(file.path) ?? FILE_NODE_BASE_H,
      data,
    });
  } else {
    const data: FolderNodeData = {
      name: rect.node.name,
      folderPath: rect.node.path ?? rect.node.name,
      worktreeId: wtId,
    };
    nodes.push({
      id: rect.node.id,
      type: 'folderNode',
      position: { x: absX, y: absY },
      width: FOLDER_NODE_W,
      height: FOLDER_NODE_H,
      data,
    });
  }

  if (parentId && !isRootChild && !suppressEdge) {
    edges.push({
      id: `edge-${parentId}-${rect.node.id}`,
      source: parentId,
      target: rect.node.id,
      style: { stroke: 'var(--color-border-dashed)', strokeWidth: 1 },
    });
  }

  let firstFileEdgeEmitted = false;
  for (const child of rect.children) {
    const isFileChild = child.node.kind === 'file';
    const suppress = isFileChild && firstFileEdgeEmitted;
    flattenRect({
      rect: child,
      parentId: rect.node.id,
      isRootChild: false,
      offsetX,
      offsetY,
      wtId,
      nodes,
      edges,
      suppressEdge: suppress,
      getFileH,
    });
    if (isFileChild) firstFileEdgeEmitted = true;
  }
}
