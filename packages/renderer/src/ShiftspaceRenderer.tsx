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

const COLUMN_WIDTH = 240;
const COLUMN_GAP = 80;
const WT_NODE_WIDTH = 200;
const FOLDER_NODE_WIDTH = 180;
const FILE_NODE_WIDTH = 170;
const WT_NODE_HEIGHT = 70;
const FOLDER_NODE_HEIGHT = 36;
const FILE_NODE_HEIGHT = 46;
const VERTICAL_GAP = 16;
const FOLDER_INDENT = 20;
const FILE_INDENT = 40;

// ---- Helpers ----

function isMainWorktree(wt: WorktreeState): boolean {
  return wt.branch === 'main' || wt.branch === 'master';
}

/** Group files by their deepest directory containing changed files.
 *  Collapses intermediate-only directories into a single path. */
function groupFilesByFolder(files: FileChange[]): {
  rootFiles: FileChange[];
  folders: { path: string; displayName: string; files: FileChange[] }[];
} {
  const rootFiles: FileChange[] = [];
  const dirMap = new Map<string, FileChange[]>();

  for (const file of files) {
    const lastSlash = file.path.lastIndexOf('/');
    if (lastSlash === -1) {
      rootFiles.push(file);
    } else {
      const dir = file.path.substring(0, lastSlash);
      const existing = dirMap.get(dir);
      if (existing) {
        existing.push(file);
      } else {
        dirMap.set(dir, [file]);
      }
    }
  }

  // Collapse directories that share a common prefix into their deepest shared form
  // e.g., if we have src/components/ui/Button.tsx and src/components/ui/Modal.tsx,
  // the folder is "src/components/ui" displayed as "src/components/ui"
  // But keep it short: if the path is long, abbreviate middle segments
  const folders = Array.from(dirMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dirPath, dirFiles]) => {
      const parts = dirPath.split('/');
      let displayName: string;
      if (parts.length <= 3) {
        displayName = dirPath;
      } else {
        // Abbreviate: first/…/last
        displayName = `${parts[0]}/\u2026/${parts[parts.length - 1]}`;
      }
      return { path: dirPath, displayName, files: dirFiles };
    });

  return { rootFiles, folders };
}

// ---- Label builders ----

function worktreeLabel(wt: WorktreeState): React.ReactNode {
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

function folderLabel(displayName: string): React.ReactNode {
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

function fileLabel(
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

// ---- Column layout ----

function computeColumnLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];

  // Total width of all columns (used to center them)
  const totalWidth = wtArray.length * COLUMN_WIDTH + (wtArray.length - 1) * COLUMN_GAP;
  const startX = -totalWidth / 2;

  wtArray.forEach((wt, wtIdx) => {
    const colX = startX + wtIdx * (COLUMN_WIDTH + COLUMN_GAP);
    let cursorY = 0;

    const wtNodeId = `wt-${wt.id}`;

    // --- Worktree node (top of column) ---
    allNodes.push({
      id: wtNodeId,
      type: 'default',
      position: { x: colX, y: cursorY },
      data: { label: worktreeLabel(wt) },
      style: {
        background: '#1a1a2e',
        border: '1px solid #3a3a4a',
        borderRadius: 12,
        color: '#e0e0ff',
        width: WT_NODE_WIDTH,
      },
    });

    cursorY += WT_NODE_HEIGHT + VERTICAL_GAP;

    const { rootFiles, folders } = groupFilesByFolder(wt.files);

    // --- Folder groups ---
    for (const folder of folders) {
      const folderNodeId = `folder-${wt.id}-${folder.path}`;

      allNodes.push({
        id: folderNodeId,
        type: 'default',
        position: { x: colX + FOLDER_INDENT, y: cursorY },
        data: { label: folderLabel(folder.displayName) },
        style: {
          background: '#151522',
          border: '1px dashed #2a2a4a',
          borderRadius: 6,
          color: '#8a8ab0',
          width: FOLDER_NODE_WIDTH,
          opacity: 0.85,
        },
      });

      allEdges.push({
        id: `edge-wt-folder-${wt.id}-${folder.path}`,
        source: wtNodeId,
        target: folderNodeId,
        type: 'smoothstep',
        style: { stroke: '#2a2a4a', strokeWidth: 1 },
      });

      cursorY += FOLDER_NODE_HEIGHT + VERTICAL_GAP;

      // Files within this folder
      for (const file of folder.files) {
        const fileNodeId = `file-${wt.id}-${file.path}`;

        allNodes.push({
          id: fileNodeId,
          type: 'default',
          position: { x: colX + FILE_INDENT, y: cursorY },
          data: { label: fileLabel(file, onFileClick, wt.id) },
          style: {
            background: '#141428',
            border: `1px solid ${file.staged ? '#4a6baa' : '#3a3a4a'}`,
            borderRadius: 6,
            color: '#c0c0e0',
            opacity: file.staged ? 1 : 0.75,
            width: FILE_NODE_WIDTH,
          },
        });

        allEdges.push({
          id: `edge-folder-file-${wt.id}-${file.path}`,
          source: folderNodeId,
          target: fileNodeId,
          type: 'smoothstep',
          style: { stroke: '#2a2a4a', strokeWidth: 1 },
        });

        cursorY += FILE_NODE_HEIGHT + VERTICAL_GAP;
      }
    }

    // --- Root-level files (no folder) ---
    for (const file of rootFiles) {
      const fileNodeId = `file-${wt.id}-${file.path}`;

      allNodes.push({
        id: fileNodeId,
        type: 'default',
        position: { x: colX + FOLDER_INDENT, y: cursorY },
        data: { label: fileLabel(file, onFileClick, wt.id) },
        style: {
          background: '#141428',
          border: `1px solid ${file.staged ? '#4a6baa' : '#3a3a4a'}`,
          borderRadius: 6,
          color: '#c0c0e0',
          opacity: file.staged ? 1 : 0.75,
          width: FILE_NODE_WIDTH,
        },
      });

      allEdges.push({
        id: `edge-wt-file-${wt.id}-${file.path}`,
        source: wtNodeId,
        target: fileNodeId,
        type: 'smoothstep',
        style: { stroke: '#2a2a4a', strokeWidth: 1 },
      });

      cursorY += FILE_NODE_HEIGHT + VERTICAL_GAP;
    }
  });

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
    return computeColumnLayout(wtArray, stableFileClick);
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
