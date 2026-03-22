import React, { useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
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

const NODE_H_GAP = 30; // horizontal gap between sibling folder subtrees
const FOLDER_V_GAP = 50; // vertical gap between folder levels
const FILE_V_GAP = 8; // vertical gap between stacked file nodes
const FILE_NODE_W = 150;
const FILE_NODE_H = 44;
const FOLDER_NODE_W = 140;
const FOLDER_NODE_H = 32;
const WT_HEADER_H = 68;
const CONTAINER_PAD_X = 30;
const CONTAINER_PAD_TOP = 20;
const CONTAINER_PAD_BOTTOM = 20;
const CONTAINER_GAP = 60;
const FILES_TOP_GAP = 40; // gap between folder node and first file below it

// ---- Custom node types for connector handle control ----

interface WtNodeData { label: React.ReactNode; [key: string]: unknown }
interface FolderNodeData { label: React.ReactNode; hasTopHandle?: boolean; hasBottomHandle?: boolean; [key: string]: unknown }
interface FileNodeData { label: React.ReactNode; hasTopHandle?: boolean; [key: string]: unknown }

// Worktree container header — NO handles at all
const WorktreeNode = React.memo(({ data }: NodeProps<Node<WtNodeData>>) => (
  <div>{data.label}</div>
));
WorktreeNode.displayName = 'WorktreeNode';

// Folder node — conditional top/bottom handles
const FolderNode = React.memo(({ data }: NodeProps<Node<FolderNodeData>>) => (
  <div>
    {data.hasTopHandle && (
      <Handle type="target" position={Position.Top} style={handleStyle} />
    )}
    {data.label}
    {data.hasBottomHandle && (
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    )}
  </div>
));
FolderNode.displayName = 'FolderNode';

// File node — conditional top handle only, never bottom
const FileNodeComponent = React.memo(({ data }: NodeProps<Node<FileNodeData>>) => (
  <div>
    {data.hasTopHandle && (
      <Handle type="target" position={Position.Top} style={handleStyle} />
    )}
    {data.label}
  </div>
));
FileNodeComponent.displayName = 'FileNodeComponent';

const handleStyle: React.CSSProperties = {
  width: 4,
  height: 4,
  background: '#3a3a5a',
  border: 'none',
  minWidth: 4,
  minHeight: 4,
};

const NODE_TYPES = {
  worktreeNode: WorktreeNode,
  folderNode: FolderNode,
  fileNode: FileNodeComponent,
};

// ---- Tree data structure ----

interface TreeNode {
  id: string;
  kind: 'folder' | 'file';
  name: string; // display label for this segment
  file?: FileChange;
  children: TreeNode[];
}

/** Build a proper folder hierarchy trie from flat file paths, then collapse
 *  single-chain intermediate folders. */
function buildTree(wtId: string, files: FileChange[]): TreeNode[] {
  // Step 1: Build a raw trie of all path segments
  interface TrieNode {
    segment: string;
    children: Map<string, TrieNode>;
    files: FileChange[]; // files that live directly in this folder
  }

  const root: TrieNode = { segment: '', children: new Map(), files: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    const fileName = parts.pop()!;
    let cur = root;
    for (const part of parts) {
      let child = cur.children.get(part);
      if (!child) {
        child = { segment: part, children: new Map(), files: [] };
        cur.children.set(part, child);
      }
      cur = child;
    }
    cur.files.push({ ...file, path: file.path }); // keep original full path
  }

  // Step 2: Convert trie to TreeNode[], collapsing single-chain intermediate folders.
  // A folder is collapsible if it has exactly 1 child folder and 0 direct files.
  function trieToTree(trie: TrieNode, pathPrefix: string): TreeNode[] {
    const results: TreeNode[] = [];

    // Process child folders
    for (const [_seg, child] of Array.from(trie.children.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const folderPath = pathPrefix ? `${pathPrefix}/${child.segment}` : child.segment;

      // Collapse single-chain: if this folder has 1 child folder and 0 files, merge down
      let collapsed = child;
      let collapsedName = child.segment;
      let collapsedPath = folderPath;
      while (collapsed.children.size === 1 && collapsed.files.length === 0) {
        const onlyChild = Array.from(collapsed.children.values())[0];
        collapsedName = `${collapsedName}/${onlyChild.segment}`;
        collapsedPath = `${collapsedPath}/${onlyChild.segment}`;
        collapsed = onlyChild;
      }

      const folderNode: TreeNode = {
        id: `folder-${wtId}-${collapsedPath}`,
        kind: 'folder',
        name: collapsedName,
        children: [],
      };

      // Add child folders recursively
      folderNode.children.push(...trieToTree(collapsed, collapsedPath));

      // Add files directly in this (collapsed) folder
      for (const f of collapsed.files) {
        folderNode.children.push({
          id: `file-${wtId}-${f.path}`,
          kind: 'file',
          name: f.path.split('/').pop() ?? f.path,
          file: f,
          children: [],
        });
      }

      results.push(folderNode);
    }

    // Process files at this level (root-level files when pathPrefix is '')
    for (const f of trie.files) {
      results.push({
        id: `file-${wtId}-${f.path}`,
        kind: 'file',
        name: f.path.split('/').pop() ?? f.path,
        file: f,
        children: [],
      });
    }

    return results;
  }

  return trieToTree(root, '');
}

// ---- Layout algorithm: folders fan out horizontally, files stack vertically ----

interface LayoutRect {
  node: TreeNode;
  x: number; // left edge, relative to parent container origin
  y: number; // top edge
  w: number; // node width
  h: number; // node height
  subtreeW: number; // total width of this subtree (for centering)
  subtreeH: number; // total height of this subtree
  children: LayoutRect[];
}

/** Layout a folder subtree. Folders fan out horizontally; files stack vertically. */
function layoutFolder(node: TreeNode, startY: number): LayoutRect {
  const folders = node.children.filter((c) => c.kind === 'folder');
  const files = node.children.filter((c) => c.kind === 'file');

  // Layout child folders recursively (they fan out horizontally below)
  const folderY = startY + FOLDER_NODE_H + FOLDER_V_GAP;
  const childFolderLayouts = folders.map((f) => layoutFolder(f, folderY));

  // Layout files stacked vertically below this folder node
  const fileStartY = startY + FOLDER_NODE_H + FILES_TOP_GAP;
  const childFileLayouts: LayoutRect[] = [];
  let fileY = fileStartY;
  for (const f of files) {
    childFileLayouts.push({
      node: f,
      x: 0, // will be set later
      y: fileY,
      w: FILE_NODE_W,
      h: FILE_NODE_H,
      subtreeW: FILE_NODE_W,
      subtreeH: FILE_NODE_H,
      children: [],
    });
    fileY += FILE_NODE_H + FILE_V_GAP;
  }
  const fileColumnH = files.length > 0 ? fileY - fileStartY - FILE_V_GAP : 0;
  const fileColumnW = files.length > 0 ? FILE_NODE_W : 0;

  // Total width of folder children side by side
  const folderChildrenW = childFolderLayouts.reduce(
    (sum, c, i) => sum + c.subtreeW + (i > 0 ? NODE_H_GAP : 0),
    0
  );

  // The subtree width is: all folder children + file column, laid out side by side
  const hasFiles = files.length > 0;
  const hasFolders = folders.length > 0;
  const allChildrenW =
    (hasFolders ? folderChildrenW : 0) +
    (hasFolders && hasFiles ? NODE_H_GAP : 0) +
    (hasFiles ? fileColumnW : 0);

  const subtreeW = Math.max(FOLDER_NODE_W, allChildrenW);

  // Position children horizontally, centered under this node
  const childBlockStart = (subtreeW - allChildrenW) / 2;
  let cx = childBlockStart;

  // Place folder children first
  for (const cl of childFolderLayouts) {
    cl.x = cx + (cl.subtreeW - cl.w) / 2; // center this folder node in its subtree
    // But we also need to offset all children within the subtree
    shiftSubtreeX(cl, cx);
    cx += cl.subtreeW + NODE_H_GAP;
  }

  // Place file column after folders
  if (hasFiles) {
    const fileX = cx + (fileColumnW - FILE_NODE_W) / 2;
    for (const fl of childFileLayouts) {
      fl.x = fileX;
    }
  }

  // Compute max subtree height
  const folderChildMaxH =
    childFolderLayouts.length > 0
      ? Math.max(...childFolderLayouts.map((c) => c.y + c.subtreeH - startY))
      : 0;
  const fileBottomH = hasFiles ? fileStartY + fileColumnH - startY : 0;
  const subtreeH = Math.max(FOLDER_NODE_H, folderChildMaxH, fileBottomH);

  return {
    node,
    x: (subtreeW - FOLDER_NODE_W) / 2, // center folder node in subtree
    y: startY,
    w: FOLDER_NODE_W,
    h: FOLDER_NODE_H,
    subtreeW,
    subtreeH,
    children: [...childFolderLayouts, ...childFileLayouts],
  };
}

/** Shift all x positions in a subtree by a base offset.
 *  (Because layoutFolder computes x relative to the subtree's own 0,
 *   we need to shift when placing subtrees side by side.) */
function shiftSubtreeX(rect: LayoutRect, baseX: number) {
  const dx = baseX + (rect.subtreeW - rect.w) / 2 - rect.x;
  rect.x += dx;
  for (const child of rect.children) {
    shiftChildrenX(child, dx);
  }
}

function shiftChildrenX(rect: LayoutRect, dx: number) {
  rect.x += dx;
  for (const child of rect.children) {
    shiftChildrenX(child, dx);
  }
}

/** Layout all top-level children of a worktree (mix of folders and root files). */
function layoutWorktreeContents(
  children: TreeNode[],
  startY: number
): { layouts: LayoutRect[]; totalW: number; totalH: number } {
  const folders = children.filter((c) => c.kind === 'folder');
  const rootFiles = children.filter((c) => c.kind === 'file');

  // Layout folders
  const folderLayouts = folders.map((f) => layoutFolder(f, startY));

  // Layout root files stacked vertically
  const rootFileLayouts: LayoutRect[] = [];
  let fileY = startY;
  for (const f of rootFiles) {
    rootFileLayouts.push({
      node: f,
      x: 0,
      y: fileY,
      w: FILE_NODE_W,
      h: FILE_NODE_H,
      subtreeW: FILE_NODE_W,
      subtreeH: FILE_NODE_H,
      children: [],
    });
    fileY += FILE_NODE_H + FILE_V_GAP;
  }
  const rootFileColumnW = rootFiles.length > 0 ? FILE_NODE_W : 0;
  const rootFileColumnH = rootFiles.length > 0 ? fileY - startY - FILE_V_GAP : 0;

  // All children side by side: folders first, then root file column
  const hasFolders = folderLayouts.length > 0;
  const hasRootFiles = rootFiles.length > 0;

  const foldersTotalW = folderLayouts.reduce(
    (sum, c, i) => sum + c.subtreeW + (i > 0 ? NODE_H_GAP : 0),
    0
  );
  const totalW =
    (hasFolders ? foldersTotalW : 0) +
    (hasFolders && hasRootFiles ? NODE_H_GAP : 0) +
    (hasRootFiles ? rootFileColumnW : 0);

  // Position everything
  let cx = 0;
  for (const fl of folderLayouts) {
    shiftSubtreeX(fl, cx);
    cx += fl.subtreeW + NODE_H_GAP;
  }
  if (hasRootFiles) {
    for (const rf of rootFileLayouts) {
      rf.x = cx;
    }
  }

  const folderMaxH =
    folderLayouts.length > 0
      ? Math.max(...folderLayouts.map((c) => c.subtreeH))
      : 0;
  const totalH = Math.max(folderMaxH, rootFileColumnH);

  return {
    layouts: [...folderLayouts, ...rootFileLayouts],
    totalW: Math.max(totalW, 200),
    totalH,
  };
}

// ---- Flatten layout to React Flow nodes and edges ----

function flattenRect(
  rect: LayoutRect,
  parentId: string | null,
  isRootChild: boolean, // direct child of worktree (no edge to parent needed)
  offsetX: number,
  offsetY: number,
  wtId: string,
  onFileClick: ((wtId: string, filePath: string) => void) | undefined,
  nodes: Node[],
  edges: Edge[]
) {
  const absX = offsetX + rect.x;
  const absY = offsetY + rect.y;
  const isFile = rect.node.kind === 'file';
  const file = rect.node.file;
  const hasChildren = rect.children.length > 0;

  // Determine handle rules
  const needsTopHandle = !isRootChild && parentId !== null;
  const needsBottomHandle = !isFile && hasChildren;

  if (isFile && file) {
    nodes.push({
      id: rect.node.id,
      type: 'fileNode',
      position: { x: absX, y: absY },
      data: {
        label: fileLabelJsx(file, onFileClick, wtId),
        hasTopHandle: needsTopHandle,
      },
      style: {
        background: '#141428',
        border: `1px solid ${file.staged ? '#4a6baa' : '#3a3a4a'}`,
        borderRadius: 6,
        color: '#c0c0e0',
        opacity: file.staged ? 1 : 0.75,
        width: FILE_NODE_W,
      },
    });
  } else {
    nodes.push({
      id: rect.node.id,
      type: 'folderNode',
      position: { x: absX, y: absY },
      data: {
        label: folderLabelJsx(rect.node.name),
        hasTopHandle: needsTopHandle,
        hasBottomHandle: needsBottomHandle,
      },
      style: {
        background: '#151522',
        border: '1px dashed #2a2a4a',
        borderRadius: 6,
        color: '#8a8ab0',
        width: FOLDER_NODE_W,
        opacity: 0.85,
      },
    });
  }

  // Add edge from parent (but NOT from worktree base node to root children)
  if (parentId && !isRootChild) {
    edges.push({
      id: `edge-${parentId}-${rect.node.id}`,
      source: parentId,
      target: rect.node.id,
      type: 'smoothstep',
      style: { stroke: '#2a2a4a', strokeWidth: 1 },
    });
  }

  // Recurse into children
  for (const child of rect.children) {
    flattenRect(child, rect.node.id, false, offsetX, offsetY, wtId, onFileClick, nodes, edges);
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

// ---- Full layout: position worktree containers side by side ----

function computeFullLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];

  // Compute each worktree's internal layout
  const wtLayouts = wtArray.map((wt) => {
    const treeChildren = buildTree(wt.id, wt.files);
    const contentsStartY = WT_HEADER_H + CONTAINER_PAD_TOP;
    const { layouts, totalW, totalH } = layoutWorktreeContents(treeChildren, contentsStartY);
    const containerW = totalW + CONTAINER_PAD_X * 2;
    const containerH = contentsStartY + totalH + CONTAINER_PAD_BOTTOM;
    return { wt, layouts, containerW, containerH, totalW };
  });

  // Total width
  const totalWidth = wtLayouts.reduce(
    (sum, wl, i) => sum + wl.containerW + (i > 0 ? CONTAINER_GAP : 0),
    0
  );
  const startX = -totalWidth / 2;

  let cursorX = startX;

  for (const wl of wtLayouts) {
    const { wt, layouts, containerW, containerH, totalW } = wl;
    const wtNodeId = `wt-${wt.id}`;

    // Worktree container (dashed outline)
    allNodes.push({
      id: wtNodeId,
      type: 'worktreeNode',
      position: { x: cursorX, y: 0 },
      data: { label: worktreeLabelJsx(wt) },
      style: {
        background: 'rgba(26, 26, 46, 0.5)',
        border: '2px dashed #2a2a4a',
        borderRadius: 16,
        color: '#e0e0ff',
        width: containerW,
        height: containerH,
        padding: `${CONTAINER_PAD_TOP}px ${CONTAINER_PAD_X}px`,
      },
    });

    // Center tree contents within container
    const contentsOffsetX = cursorX + (containerW - totalW) / 2;

    for (const layout of layouts) {
      flattenRect(
        layout,
        wtNodeId,
        true, // root children — no edge to worktree base node
        contentsOffsetX,
        0, // y already computed relative to container top
        wt.id,
        onFileClick,
        allNodes,
        allEdges
      );
    }

    cursorX += containerW + CONTAINER_GAP;
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
        nodeTypes={NODE_TYPES}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background color="#2a2a3a" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  );
};
