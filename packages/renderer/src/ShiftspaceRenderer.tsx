import React, { useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorktreeState, FileChange, ShiftspaceEvent } from './types';
import { useShiftspaceStore } from './store';

interface Props {
  initialWorktrees?: WorktreeState[];
  onEvent?: (handler: (event: ShiftspaceEvent) => void) => () => void;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onTerminalOpen?: (worktreeId: string) => void;
}

// ---- Layout constants ----

const NODE_H_GAP = 24; // horizontal gap between sibling nodes
const NODE_V_GAP = 60; // vertical gap between tree levels
const FILE_NODE_W = 150; // width of a file node
const FILE_NODE_H = 44; // height of a file node
const FOLDER_NODE_W = 150; // width of a folder node
const FOLDER_NODE_H = 32; // height of a folder node
const WT_HEADER_H = 68; // height of the worktree header area inside container
const CONTAINER_PAD = 24; // padding inside the worktree container
const CONTAINER_GAP = 60; // horizontal gap between worktree containers

// ---- Tree data structure ----

interface TreeNode {
  id: string; // unique node id for React Flow
  kind: 'folder' | 'file';
  name: string; // display label
  file?: FileChange; // only for file nodes
  children: TreeNode[];
}

/** Build a tree from the flat file list.
 *  Groups files by deepest containing folder, collapses intermediate dirs. */
function buildTree(wtId: string, files: FileChange[]): TreeNode[] {
  const rootFiles: FileChange[] = [];
  const dirMap = new Map<string, FileChange[]>();

  for (const file of files) {
    const lastSlash = file.path.lastIndexOf('/');
    if (lastSlash === -1) {
      rootFiles.push(file);
    } else {
      const dir = file.path.substring(0, lastSlash);
      let arr = dirMap.get(dir);
      if (!arr) {
        arr = [];
        dirMap.set(dir, arr);
      }
      arr.push(file);
    }
  }

  const children: TreeNode[] = [];

  // Folder nodes (sorted alphabetically)
  const sortedDirs = Array.from(dirMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [dirPath, dirFiles] of sortedDirs) {
    const parts = dirPath.split('/');
    const displayName =
      parts.length <= 3 ? dirPath : `${parts[0]}/\u2026/${parts[parts.length - 1]}`;

    const folderNode: TreeNode = {
      id: `folder-${wtId}-${dirPath}`,
      kind: 'folder',
      name: displayName,
      children: dirFiles.map((f) => ({
        id: `file-${wtId}-${f.path}`,
        kind: 'file' as const,
        name: f.path.split('/').pop() ?? f.path,
        file: f,
        children: [],
      })),
    };
    children.push(folderNode);
  }

  // Root-level files
  for (const f of rootFiles) {
    children.push({
      id: `file-${wtId}-${f.path}`,
      kind: 'file',
      name: f.path.split('/').pop() ?? f.path,
      file: f,
      children: [],
    });
  }

  return children;
}

// ---- Tidy tree layout ----

interface LayoutNode {
  treeNode: TreeNode;
  x: number; // center x (relative to subtree)
  y: number; // top y (relative to tree root)
  width: number; // this node's width
  height: number; // this node's height
  subtreeWidth: number; // total width of the subtree rooted here
  children: LayoutNode[];
}

/** Recursively compute subtree width (bottom-up), then assign x positions (top-down). */
function layoutTree(nodes: TreeNode[], startY: number): LayoutNode[] {
  return nodes.map((node) => layoutSubtree(node, startY));
}

function layoutSubtree(node: TreeNode, y: number): LayoutNode {
  const w = node.kind === 'file' ? FILE_NODE_W : FOLDER_NODE_W;
  const h = node.kind === 'file' ? FILE_NODE_H : FOLDER_NODE_H;

  if (node.children.length === 0) {
    return {
      treeNode: node,
      x: 0,
      y,
      width: w,
      height: h,
      subtreeWidth: w,
      children: [],
    };
  }

  const childY = y + h + NODE_V_GAP;
  const childLayouts = node.children.map((c) => layoutSubtree(c, childY));

  // Total width of all children subtrees plus gaps between them
  const totalChildrenWidth = childLayouts.reduce(
    (sum, c, i) => sum + c.subtreeWidth + (i > 0 ? NODE_H_GAP : 0),
    0
  );

  // Subtree width is max of this node's width and children's total width
  const subtreeWidth = Math.max(w, totalChildrenWidth);

  // Position children within the subtree width, centered
  const childrenBlockStart = (subtreeWidth - totalChildrenWidth) / 2;
  let cx = childrenBlockStart;
  for (const child of childLayouts) {
    child.x = cx + child.subtreeWidth / 2;
    cx += child.subtreeWidth + NODE_H_GAP;
  }

  return {
    treeNode: node,
    x: subtreeWidth / 2, // center this node within its subtree
    y,
    width: w,
    height: h,
    subtreeWidth,
    children: childLayouts,
  };
}

/** Flatten a LayoutNode tree into positioned React Flow nodes + edges.
 *  offsetX/offsetY shift all positions to the container's coordinate space. */
function flattenLayout(
  layout: LayoutNode,
  parentId: string | null,
  offsetX: number,
  offsetY: number,
  wtId: string,
  onFileClick: ((wtId: string, filePath: string) => void) | undefined,
  nodes: Node[],
  edges: Edge[]
) {
  const absX = offsetX + layout.x - layout.width / 2;
  const absY = offsetY + layout.y;

  const isFile = layout.treeNode.kind === 'file';
  const file = layout.treeNode.file;

  nodes.push({
    id: layout.treeNode.id,
    type: 'default',
    position: { x: absX, y: absY },
    parentId: undefined, // not using React Flow parenting — we position manually
    data: {
      label: isFile && file
        ? fileLabelJsx(file, onFileClick, wtId)
        : folderLabelJsx(layout.treeNode.name),
    },
    style: isFile && file
      ? {
          background: '#141428',
          border: `1px solid ${file.staged ? '#4a6baa' : '#3a3a4a'}`,
          borderRadius: 6,
          color: '#c0c0e0',
          opacity: file.staged ? 1 : 0.75,
          width: FILE_NODE_W,
        }
      : {
          background: '#151522',
          border: '1px dashed #2a2a4a',
          borderRadius: 6,
          color: '#8a8ab0',
          width: FOLDER_NODE_W,
          opacity: 0.85,
        },
  });

  if (parentId) {
    edges.push({
      id: `edge-${parentId}-${layout.treeNode.id}`,
      source: parentId,
      target: layout.treeNode.id,
      type: 'smoothstep',
      style: { stroke: '#2a2a4a', strokeWidth: 1 },
    });
  }

  for (const child of layout.children) {
    flattenLayout(child, layout.treeNode.id, offsetX, offsetY, wtId, onFileClick, nodes, edges);
  }
}

// ---- Label JSX builders ----

function isMainWorktree(wt: WorktreeState): boolean {
  return wt.branch === 'main' || wt.branch === 'master';
}

function worktreeLabelJsx(wt: WorktreeState): React.ReactNode {
  const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
  const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
  const isMain = isMainWorktree(wt);
  const pathPart = isMain ? null : wt.id;

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontWeight: 600, color: '#e0e0ff', fontSize: 13 }}>
        {pathPart && <span>{pathPart} </span>}
        {pathPart ? (
          <span style={{ color: '#6b6b8a', fontWeight: 400 }}>({wt.branch})</span>
        ) : (
          <span>{wt.branch}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#9a9ab0', marginTop: 2 }}>
        {wt.files.length} file{wt.files.length !== 1 ? 's' : ''} ·{' '}
        <span style={{ color: '#4ec94e' }}>+{totalAdded}</span>{' '}
        <span style={{ color: '#e05c5c' }}>-{totalRemoved}</span>
      </div>
      {wt.process && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color: '#4ec9b0',
            background: '#0d2d26',
            borderRadius: 3,
            padding: '1px 5px',
            display: 'inline-block',
          }}
        >
          :{wt.process.port}
        </div>
      )}
    </div>
  );
}

function folderLabelJsx(displayName: string): React.ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left' }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>📁</span>
      <span
        style={{
          fontSize: 11,
          color: '#8a8ab0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayName}
      </span>
    </div>
  );
}

function fileLabelJsx(
  file: FileChange,
  onFileClick?: (worktreeId: string, filePath: string) => void,
  worktreeId?: string
): React.ReactNode {
  const fileName = file.path.split('/').pop() ?? file.path;
  const statusColors = { added: '#4ec94e', modified: '#e0c44e', deleted: '#e05c5c' };
  const isPulsing = Date.now() - file.lastChangedAt < 3000;

  return (
    <div
      style={{
        cursor: onFileClick ? 'pointer' : 'default',
        textAlign: 'left',
        background: isPulsing ? 'rgba(78, 201, 78, 0.06)' : 'transparent',
        transition: 'background 0.3s ease',
      }}
      onClick={() => onFileClick?.(worktreeId ?? '', file.path)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: statusColors[file.status],
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: '#c0c0e0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 120,
          }}
        >
          {fileName}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#6b6b8a', marginTop: 1 }}>
        <span style={{ color: '#4ec94e' }}>+{file.linesAdded}</span>{' '}
        <span style={{ color: '#e05c5c' }}>-{file.linesRemoved}</span>
      </div>
    </div>
  );
}

// ---- Main layout: compute tree per worktree, then position containers side by side ----

interface WorktreeLayout {
  wt: WorktreeState;
  treeChildren: TreeNode[];
  childLayouts: LayoutNode[];
  containerWidth: number;
  containerHeight: number;
}

function computeWorktreeLayout(wt: WorktreeState): WorktreeLayout {
  const treeChildren = buildTree(wt.id, wt.files);
  const childLayouts = layoutTree(treeChildren, WT_HEADER_H + NODE_V_GAP);

  // Compute bounds of all child layouts
  let maxRight = 0;
  let maxBottom = WT_HEADER_H;

  function measureBounds(layout: LayoutNode) {
    const right = layout.x + layout.subtreeWidth / 2;
    const bottom = layout.y + layout.height;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
    layout.children.forEach(measureBounds);
  }
  childLayouts.forEach(measureBounds);

  // Total width needed for all top-level children side by side
  const totalChildrenWidth = childLayouts.reduce(
    (sum, c, i) => sum + c.subtreeWidth + (i > 0 ? NODE_H_GAP : 0),
    0
  );
  const contentWidth = Math.max(totalChildrenWidth, 200); // min 200 for the header

  const containerWidth = contentWidth + CONTAINER_PAD * 2;
  const containerHeight = maxBottom + CONTAINER_PAD;

  return { wt, treeChildren, childLayouts, containerWidth, containerHeight };
}

function computeFullLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];

  // Layout each worktree independently
  const wtLayouts = wtArray.map(computeWorktreeLayout);

  // Total width of all containers
  const totalWidth = wtLayouts.reduce(
    (sum, wl, i) => sum + wl.containerWidth + (i > 0 ? CONTAINER_GAP : 0),
    0
  );
  const startX = -totalWidth / 2;

  let cursorX = startX;
  const containerTopY = 0; // all containers top-aligned

  for (const wl of wtLayouts) {
    const { wt, childLayouts, containerWidth, containerHeight } = wl;
    const wtNodeId = `wt-${wt.id}`;

    // --- Worktree container node (group node with dashed outline) ---
    allNodes.push({
      id: wtNodeId,
      type: 'default',
      position: { x: cursorX, y: containerTopY },
      data: { label: worktreeLabelJsx(wt) },
      style: {
        background: 'rgba(26, 26, 46, 0.5)',
        border: '2px dashed #2a2a4a',
        borderRadius: 16,
        color: '#e0e0ff',
        width: containerWidth,
        height: containerHeight,
        padding: `${CONTAINER_PAD}px`,
      },
    });

    // --- Position child trees within container ---
    // Center children horizontally within the container
    const totalChildrenWidth = childLayouts.reduce(
      (sum, c, i) => sum + c.subtreeWidth + (i > 0 ? NODE_H_GAP : 0),
      0
    );
    const childBlockStartX = (containerWidth - totalChildrenWidth) / 2;

    let childCursorX = childBlockStartX;
    for (const childLayout of childLayouts) {
      // Each child tree is positioned relative to its subtree center
      const treeOffsetX = cursorX + childCursorX;
      const treeOffsetY = containerTopY;

      flattenLayout(
        childLayout,
        wtNodeId,
        treeOffsetX,
        treeOffsetY,
        wt.id,
        onFileClick,
        allNodes,
        allEdges
      );

      childCursorX += childLayout.subtreeWidth + NODE_H_GAP;
    }

    cursorX += containerWidth + CONTAINER_GAP;
  }

  return { nodes: allNodes, edges: allEdges };
}

// ---- Main component ----

export const ShiftspaceRenderer: React.FC<Props> = ({
  initialWorktrees = [],
  onEvent,
  onFileClick,
}) => {
  const { worktrees, setWorktrees, applyEvent } = useShiftspaceStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setWorktrees(initialWorktrees);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onEvent) return;
    return onEvent(applyEvent);
  }, [onEvent, applyEvent]);

  const fileClickRef = React.useRef(onFileClick);
  fileClickRef.current = onFileClick;
  const stableFileClick = useCallback(
    (wtId: string, filePath: string) => fileClickRef.current?.(wtId, filePath),
    []
  );

  const layout = useMemo(() => {
    const wtArray = Array.from(worktrees.values());
    return computeFullLayout(wtArray, stableFileClick);
  }, [worktrees, stableFileClick]);

  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0d0d1a' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        colorMode="dark"
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background color="#2a2a3a" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  );
};
