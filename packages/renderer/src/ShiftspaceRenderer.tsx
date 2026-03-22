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

// ---- Radial layout helpers ----

/** Compute the angle for each worktree, evenly distributed around 360° */
function computeWorktreeAngles(count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [-Math.PI / 2]; // straight up
  // Start from top (-PI/2) and distribute evenly
  return Array.from({ length: count }, (_, i) => -Math.PI / 2 + (2 * Math.PI * i) / count);
}

/** Distance from center for worktree cluster nodes */
const WT_RADIUS = 350;

/** Distance from worktree center for file nodes */
const FILE_INNER_RADIUS = 120;
const FILE_RADIAL_SPACING = 80;
const FILE_ARC_SPACING = 55;

/** Determine if this worktree is the "main" (repo root) worktree */
function isMainWorktree(wt: WorktreeState): boolean {
  // Heuristic: main worktree has the shortest path or is the repo root
  // In our mock data, the first worktree is typically 'main'
  // We check if the path doesn't contain a linked worktree indicator
  // or if the branch is main/master
  return wt.branch === 'main' || wt.branch === 'master';
}

/** Build the label for a worktree node */
function worktreeLabel(wt: WorktreeState): React.ReactNode {
  const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
  const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
  const isMain = isMainWorktree(wt);

  // For main worktree, just show branch name. For linked worktrees, show path (branch)
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

/** Build the label for a file node */
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

/** Compute radial positions for all nodes */
function computeRadialLayout(
  wtArray: WorktreeState[],
  onFileClick?: (worktreeId: string, filePath: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const angles = computeWorktreeAngles(wtArray.length);
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];

  wtArray.forEach((wt, wtIdx) => {
    const angle = angles[wtIdx];
    const wtX = Math.cos(angle) * WT_RADIUS;
    const wtY = Math.sin(angle) * WT_RADIUS;

    const wtNodeId = `wt-${wt.id}`;

    // Worktree cluster node
    allNodes.push({
      id: wtNodeId,
      type: 'default',
      position: { x: wtX - 90, y: wtY - 30 },
      data: { label: worktreeLabel(wt) },
      style: {
        background: '#1a1a2e',
        border: '1px solid #3a3a4a',
        borderRadius: 12,
        color: '#e0e0ff',
        width: 180,
      },
    });

    // File nodes: fan out from worktree in the same angular direction
    const fileCount = wt.files.length;
    if (fileCount === 0) return;

    // Compute positions in a fan pattern radiating outward from worktree node
    // Group files into "rows" of increasing radius
    const filesPerRow = Math.max(3, Math.ceil(Math.sqrt(fileCount)));

    wt.files.forEach((file, fileIdx) => {
      const row = Math.floor(fileIdx / filesPerRow);
      const col = fileIdx % filesPerRow;
      const rowFileCount = Math.min(filesPerRow, fileCount - row * filesPerRow);

      // Radial distance from worktree center
      const fileRadius = FILE_INNER_RADIUS + row * FILE_RADIAL_SPACING;

      // Angular spread: files fan out perpendicular to the worktree angle
      const arcSpan = (rowFileCount - 1) * FILE_ARC_SPACING;
      const perpAngle = angle + Math.PI / 2; // perpendicular
      const startOffset = -arcSpan / 2;
      const colOffset = startOffset + col * FILE_ARC_SPACING;

      // Position: go outward along the worktree angle, then offset perpendicular
      const fileX =
        wtX + Math.cos(angle) * fileRadius + Math.cos(perpAngle) * colOffset - 70;
      const fileY =
        wtY + Math.sin(angle) * fileRadius + Math.sin(perpAngle) * colOffset - 20;

      const fileNodeId = `file-${wt.id}-${file.path}`;

      allNodes.push({
        id: fileNodeId,
        type: 'default',
        position: { x: fileX, y: fileY },
        data: { label: fileLabel(file, onFileClick, wt.id) },
        style: {
          background: '#141428',
          border: `1px solid ${file.staged ? '#4a6baa' : '#3a3a4a'}`,
          borderRadius: 6,
          color: '#c0c0e0',
          opacity: file.staged ? 1 : 0.75,
          width: 150,
        },
      });

      // Edge from worktree to file (subtle connector)
      allEdges.push({
        id: `edge-${wt.id}-${file.path}`,
        source: wtNodeId,
        target: fileNodeId,
        type: 'smoothstep',
        style: { stroke: '#2a2a4a', strokeWidth: 1 },
        animated: false,
      });
    });
  });

  return { nodes: allNodes, edges: allEdges };
}

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

  // Memoize the onFileClick ref to avoid unnecessary layout recomputation
  const fileClickRef = React.useRef(onFileClick);
  fileClickRef.current = onFileClick;
  const stableFileClick = useCallback(
    (wtId: string, filePath: string) => fileClickRef.current?.(wtId, filePath),
    []
  );

  // Derive React Flow nodes from worktree state using radial layout
  const layout = useMemo(() => {
    const wtArray = Array.from(worktrees.values());
    return computeRadialLayout(wtArray, stableFileClick);
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
