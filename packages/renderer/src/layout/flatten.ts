import type { LayoutRect } from './algorithm';
import type { LayoutNode, LayoutEdge } from '../TreeCanvas';
import type { FileChange } from '../types';
import { FILE_NODE_W, FILE_NODE_H, FOLDER_NODE_W, FOLDER_NODE_H } from './constants';

export interface WorktreeNodeData {
  worktree: import('../types').WorktreeState;
  [key: string]: unknown;
}

export interface FolderNodeData {
  name: string;
  [key: string]: unknown;
}

export interface FileNodeData {
  file: FileChange;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  worktreeId: string;
  [key: string]: unknown;
}

export function flattenRect(
  rect: LayoutRect,
  parentId: string | null,
  isRootChild: boolean,
  offsetX: number,
  offsetY: number,
  wtId: string,
  onFileClick: ((wtId: string, filePath: string) => void) | undefined,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  suppressEdge = false
) {
  const absX = offsetX + rect.x;
  const absY = offsetY + rect.y;
  const isFile = rect.node.kind === 'file';
  const file = rect.node.file;

  if (isFile && file) {
    const data: FileNodeData = { file, worktreeId: wtId, onFileClick };
    nodes.push({
      id: rect.node.id,
      type: 'fileNode',
      position: { x: absX, y: absY },
      width: FILE_NODE_W,
      height: FILE_NODE_H,
      data,
    });
  } else {
    const data: FolderNodeData = { name: rect.node.name };
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
    flattenRect(child, rect.node.id, false, offsetX, offsetY, wtId, onFileClick, nodes, edges, suppress);
    if (isFileChild) firstFileEdgeEmitted = true;
  }
}
