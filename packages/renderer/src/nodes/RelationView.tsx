import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useShiftspaceStore } from '../store';
import type { FileSimilarity } from '../types';
import { ThemedFileIcon } from '../shared/ThemedFileIcon';

// ---------------------------------------------------------------------------
// Force-directed simulation (Fix 5: increased spacing)
// ---------------------------------------------------------------------------

const NODE_W = 140;
const NODE_H = 40;
const NODE_HALF_W = NODE_W / 2;
const NODE_HALF_H = NODE_H / 2;
const MIN_GAP = 20;
const COLLISION_RADIUS = Math.hypot(NODE_HALF_W, NODE_HALF_H) + MIN_GAP;

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  totalChanges: number;
}

interface SimEdge {
  source: string;
  target: string;
  similarity: number;
  pair: FileSimilarity;
}

function runSimulation(nodes: SimNode[], edges: SimEdge[], iterations: number): void {
  const repulsionStrength = 15000;
  const attractionStrength = 0.02;
  const damping = 0.82;
  const centerPull = 0.008;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 1;
        const force = repulsionStrength / distSq;
        const dist = Math.sqrt(distSq);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx += dx;
        a.vy += dy;
        b.vx -= dx;
        b.vy -= dy;
      }
    }

    // Attraction along edges — lower similarity = longer natural length
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const idealDist = 180 + (1 - edge.similarity) * 220;
      const displacement = dist - idealDist;
      const force = displacement * attractionStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center pull
    for (const node of nodes) {
      node.vx -= node.x * centerPull;
      node.vy -= node.y * centerPull;
    }

    // Collision avoidance — prevent node overlap
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        if (dist < COLLISION_RADIUS * 2) {
          const overlap = COLLISION_RADIUS * 2 - dist;
          const push = overlap * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.vx -= nx * push;
          a.vy -= ny * push;
          b.vx += nx * push;
          b.vy += ny * push;
        }
      }
    }

    // Apply velocity
    for (const node of nodes) {
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RelationViewProps {
  worktreeId: string;
  onFileClick?: (worktreeId: string, filePath: string) => void;
}

export const RelationView = React.memo(({ worktreeId, onFileClick }: RelationViewProps) => {
  const wt = useShiftspaceStore((s) => s.worktrees.get(worktreeId));
  const duplicationData = useShiftspaceStore((s) => s.duplicationDetails.get(worktreeId));
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<FileSimilarity | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const pairs = duplicationData?.pairs ?? [];

  // Build graph data — Fix 2: only include connected nodes
  const { simNodes, simEdges } = useMemo(() => {
    if (!wt || pairs.length === 0) return { simNodes: [], simEdges: [] };

    const simEdges: SimEdge[] = pairs.map((p) => ({
      source: p.fileA,
      target: p.fileB,
      similarity: p.overallSimilarity,
      pair: p,
    }));

    // Only files that participate in at least one edge
    const connectedFiles = new Set<string>();
    for (const edge of simEdges) {
      connectedFiles.add(edge.source);
      connectedFiles.add(edge.target);
    }

    const fileArr = Array.from(connectedFiles);
    const simNodes: SimNode[] = fileArr.map((filePath, i) => {
      const file = wt.files.find((f) => f.path === filePath);
      const totalChanges = file ? file.linesAdded + file.linesRemoved : 0;
      const angle = (i / fileArr.length) * 2 * Math.PI;
      const radius = 200;
      return {
        id: filePath,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        totalChanges,
      };
    });

    runSimulation(simNodes, simEdges, 120);

    return { simNodes, simEdges };
  }, [wt, pairs]);

  // Calculate viewport transform to center the graph
  const transform = useMemo(() => {
    if (simNodes.length === 0)
      return { tx: dimensions.width / 2, ty: dimensions.height / 2, scale: 1 };
    const xs = simNodes.map((n) => n.x);
    const ys = simNodes.map((n) => n.y);
    const padX = NODE_W + 20;
    const padY = NODE_H + 20;
    const minX = Math.min(...xs) - padX;
    const maxX = Math.max(...xs) + padX;
    const minY = Math.min(...ys) - padY;
    const maxY = Math.max(...ys) + padY;
    const graphW = maxX - minX;
    const graphH = maxY - minY;
    const scale = Math.min(dimensions.width / graphW, dimensions.height / graphH, 1.5) * 0.85;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      tx: dimensions.width / 2 - cx * scale,
      ty: dimensions.height / 2 - cy * scale,
      scale,
    };
  }, [simNodes, dimensions]);

  const handleNodeClick = useCallback(
    (filePath: string) => {
      onFileClick?.(worktreeId, filePath);
    },
    [worktreeId, onFileClick]
  );

  // Fix 2: clean empty state
  if (pairs.length === 0 || simNodes.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-faint">
        <i className="codicon codicon-check" style={{ fontSize: 24 }} aria-hidden="true" />
        <span className="text-11">No duplications detected</span>
      </div>
    );
  }

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <svg width={dimensions.width} height={dimensions.height}>
        <g transform={`translate(${transform.tx},${transform.ty}) scale(${transform.scale})`}>
          {/* Layer 1: Edges */}
          {simEdges.map((edge) => {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) return null;
            const edgeKey = `${edge.source}::${edge.target}`;
            const thickness = 1 + edge.similarity * 3;
            const opacity = 0.3 + edge.similarity * 0.7;

            return (
              <g key={edgeKey}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--color-status-modified, #e2b541)"
                  strokeWidth={thickness}
                  opacity={opacity}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredEdge(edgeKey)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  onClick={() => setSelectedEdge(edge.pair)}
                />
                {/* Wider invisible hit target */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredEdge(edgeKey)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  onClick={() => setSelectedEdge(edge.pair)}
                />
              </g>
            );
          })}

          {/* Layer 2: File nodes — Fix 3: rounded rectangles matching tree view */}
          {simNodes.map((node) => {
            const fileName = node.id.split('/').pop() ?? node.id;
            const displayName = fileName.length > 18 ? fileName.slice(0, 16) + '\u2026' : fileName;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x - NODE_HALF_W},${node.y - NODE_HALF_H})`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleNodeClick(node.id)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  ry={6}
                  fill="var(--color-node-file-bg, #1e1e1e)"
                  stroke="var(--color-border-default, #333)"
                  strokeWidth={1}
                />
                {/* Hover overlay */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  ry={6}
                  fill="transparent"
                  className="hover:fill-node-file-pulse"
                />
                {/* File icon placeholder area */}
                <foreignObject x={8} y={8} width={16} height={16}>
                  <ThemedFileIcon filePath={node.id} size={14} />
                </foreignObject>
                {/* Filename */}
                <text
                  x={30}
                  y={20}
                  fontSize={11}
                  fill="var(--color-text-primary, #ccc)"
                  dominantBaseline="central"
                >
                  {displayName}
                </text>
                {/* Change stats */}
                {node.totalChanges > 0 && (
                  <text x={30} y={33} fontSize={9} dominantBaseline="central">
                    <tspan fill="var(--color-status-added, #4ec94e)">
                      +{wt?.files.find((f) => f.path === node.id)?.linesAdded ?? 0}
                    </tspan>
                    <tspan fill="var(--color-text-faint, #666)"> </tspan>
                    <tspan fill="var(--color-status-deleted, #e05c5c)">
                      -{wt?.files.find((f) => f.path === node.id)?.linesRemoved ?? 0}
                    </tspan>
                  </text>
                )}
              </g>
            );
          })}

          {/* Layer 3: Edge labels — Fix 4: highest z-index, background pill, >70% only */}
          {simEdges.map((edge) => {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) return null;
            const edgeKey = `${edge.source}::${edge.target}`;
            const isHovered = hoveredEdge === edgeKey;
            const showLabel = edge.similarity > 0.7 || isHovered;
            if (!showLabel) return null;

            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            // Offset perpendicular to edge to avoid node overlap
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const perpX = (-dy / len) * 14;
            const perpY = (dx / len) * 14;
            const labelText = `${Math.round(edge.similarity * 100)}%`;

            return (
              <g key={`label-${edgeKey}`}>
                {/* Background pill */}
                <rect
                  x={mx + perpX - 16}
                  y={my + perpY - 8}
                  width={32}
                  height={16}
                  rx={8}
                  ry={8}
                  fill="rgba(0, 0, 0, 0.75)"
                />
                <text
                  x={mx + perpX}
                  y={my + perpY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontWeight={600}
                  fill="#e0e0e0"
                >
                  {labelText}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Edge detail popover */}
      {selectedEdge && (
        <div
          className="absolute top-2 right-2 bg-canvas border border-border-dashed rounded-lg p-3 max-w-xs shadow-lg z-10"
          style={{ maxHeight: '50%', overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-11 font-semibold text-text-primary">
              {Math.round(selectedEdge.overallSimilarity * 100)}% similar
            </span>
            <button
              className="text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
              onClick={() => setSelectedEdge(null)}
            >
              <i className="codicon codicon-close" style={{ fontSize: 12 }} aria-hidden="true" />
            </button>
          </div>
          <div className="text-10 text-text-muted mb-2">
            <div className="truncate">{selectedEdge.fileA}</div>
            <div className="truncate">{selectedEdge.fileB}</div>
          </div>
          {selectedEdge.matchedBlocks.map((block, i) => (
            <div key={i} className="text-10 text-text-muted py-0.5 border-t border-border-dashed">
              <button
                className="text-text-primary hover:underline bg-transparent border-none p-0 cursor-pointer text-10"
                onClick={() => onFileClick?.(worktreeId, block.fileA)}
              >
                L{block.startLineA}-{block.endLineA}
              </button>
              <span className="mx-1">&harr;</span>
              <button
                className="text-text-primary hover:underline bg-transparent border-none p-0 cursor-pointer text-10"
                onClick={() => onFileClick?.(worktreeId, block.fileB)}
              >
                L{block.startLineB}-{block.endLineB}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
RelationView.displayName = 'RelationView';
