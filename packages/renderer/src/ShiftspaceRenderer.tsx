import React, { useEffect, useMemo, useCallback, useState } from 'react';
import clsx from 'clsx';
import type { WorktreeState, FileChange, ShiftspaceEvent } from './types';
import { useShiftspaceStore } from './store';
import { STATUS_CLASSES } from './utils/statusClasses';
import { TreeCanvas, type LayoutNode, type LayoutEdge, type NodeComponentProps } from './TreeCanvas';

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

// ---- Custom node types ----

interface WtNodeData { label: React.ReactNode; [key: string]: unknown }
interface FolderNodeData { label: React.ReactNode; [key: string]: unknown }
interface FileNodeData { label: React.ReactNode; staged?: boolean; [key: string]: unknown }

// Worktree container header
const WorktreeNode = React.memo(({ data }: NodeComponentProps<WtNodeData>) => (
  <div>{data.label}</div>
));
WorktreeNode.displayName = 'WorktreeNode';

// Folder node
const FolderNode = React.memo(({ data }: NodeComponentProps<FolderNodeData>) => (
  <div>{data.label}</div>
));
FolderNode.displayName = 'FolderNode';

// File node
const FileNodeComponent = React.memo(({ data }: NodeComponentProps<FileNodeData>) => (
  <div>{data.label}</div>
));
FileNodeComponent.displayName = 'FileNodeComponent';

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

  // Place file column first (left side), then folder children (right side)
  if (hasFiles) {
    for (const fl of childFileLayouts) {
      fl.x = cx;
    }
    cx += fileColumnW + NODE_H_GAP;
  }

  for (const cl of childFolderLayouts) {
    shiftSubtreeX(cl, cx);
    cx += cl.subtreeW + NODE_H_GAP;
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

/** Shift all x positions in a subtree by dx (recursive). */
function shiftSubtreeX(rect: LayoutRect, dx: number) {
  rect.x += dx;
  for (const child of rect.children) {
    shiftSubtreeX(child, dx);
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

  // Position everything: folders first, then root file column
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

// ---- Flatten layout to LayoutNode and LayoutEdge arrays ----

function flattenRect(
  rect: LayoutRect,
  parentId: string | null,
  isRootChild: boolean, // direct child of worktree (no edge to parent needed)
  offsetX: number,
  offsetY: number,
  wtId: string,
  onFileClick: ((wtId: string, filePath: string) => void) | undefined,
  nodes: LayoutNode[],
  edges: LayoutEdge[]
) {
  const absX = offsetX + rect.x;
  const absY = offsetY + rect.y;
  const isFile = rect.node.kind === 'file';
  const file = rect.node.file;

  if (isFile && file) {
    nodes.push({
      id: rect.node.id,
      type: 'fileNode',
      position: { x: absX, y: absY },
      width: FILE_NODE_W,
      height: FILE_NODE_H,
      data: {
        label: fileLabelJsx(file, onFileClick, wtId),
        staged: file.staged,
      },
      className: clsx(
        'border rounded-md text-text-secondary transition-[background,opacity] duration-300',
        file.staged ? '!border-border-staged !opacity-100' : '!border-border-default !opacity-75',
        Date.now() - file.lastChangedAt < 3000 ? '!bg-node-file-pulse' : '!bg-node-file'
      ),
    });
  } else {
    nodes.push({
      id: rect.node.id,
      type: 'folderNode',
      position: { x: absX, y: absY },
      width: FOLDER_NODE_W,
      height: FOLDER_NODE_H,
      data: {
        label: folderLabelJsx(rect.node.name),
      },
      className: 'border border-dashed border-border-dashed rounded-md bg-node-folder text-text-dim !opacity-85',
    });
  }

  // Add edge from parent (but NOT from worktree base node to root children)
  if (parentId && !isRootChild) {
    edges.push({
      id: `edge-${parentId}-${rect.node.id}`,
      source: parentId,
      target: rect.node.id,
      style: { stroke: 'var(--color-border-dashed)', strokeWidth: 1 },
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
    <div className="text-left">
      <div className="font-semibold text-text-primary text-[13px]">
        {pathPart && <span>{pathPart} </span>}
        {pathPart ? (
          <span className="text-text-faint font-normal">({wt.branch})</span>
        ) : (
          <span>{wt.branch}</span>
        )}
      </div>
      <div className="text-[11px] text-text-muted mt-[2px]">
        {wt.files.length} file{wt.files.length !== 1 ? 's' : ''} ·{' '}
        <span className="text-status-added">+{totalAdded}</span>{' '}
        <span className="text-status-deleted">-{totalRemoved}</span>
      </div>
      {wt.process && (
        <div className="mt-1 text-[10px] text-teal bg-process-badge rounded-[3px] px-[5px] py-[1px] inline-block">
          :{wt.process.port}
        </div>
      )}
    </div>
  );
}

function folderLabelJsx(displayName: string): React.ReactNode {
  return (
    <div className="flex items-center gap-[5px] text-left">
      <span className="text-[13px] shrink-0">📁</span>
      <span className="text-[11px] text-text-dim overflow-hidden text-ellipsis whitespace-nowrap">
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
  const isPulsing = Date.now() - file.lastChangedAt < 3000;

  return (
    <div
      className={clsx(
        'text-left transition-[background] duration-300',
        onFileClick ? 'cursor-pointer' : 'cursor-default',
        isPulsing ? 'bg-[rgba(78,201,78,0.06)]' : 'bg-transparent'
      )}
      onClick={() => onFileClick?.(worktreeId ?? '', file.path)}
    >
      <div className="flex items-center gap-[5px]">
        <span className={clsx('w-[7px] h-[7px] rounded-full inline-block shrink-0', STATUS_CLASSES[file.status])} />
        <span className="text-[11px] text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]">
          {fileName}
        </span>
      </div>
      <div className="text-[10px] text-text-faint mt-[1px]">
        <span className="text-status-added">+{file.linesAdded}</span>{' '}
        <span className="text-status-deleted">-{file.linesRemoved}</span>
      </div>
    </div>
  );
}

// ---- Full layout: position worktree containers side by side ----

function computeFullLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const allNodes: LayoutNode[] = [];
  const allEdges: LayoutEdge[] = [];

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
      width: containerW,
      height: containerH,
      data: { label: worktreeLabelJsx(wt) },
      style: {
        padding: `${CONTAINER_PAD_TOP}px ${CONTAINER_PAD_X}px`,
      },
      className: 'border-2 border-dashed border-border-dashed rounded-2xl bg-cluster-alpha text-text-primary',
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
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [edges, setEdges] = useState<LayoutEdge[]>([]);

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
  }, [layout]);

  return (
    <div className="w-full h-full bg-canvas">
      <TreeCanvas nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} />
    </div>
  );
};
