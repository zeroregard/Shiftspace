import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useShiftspaceStore } from '../store';
import type { FileSimilarity } from '../types';
import { ThemedFileIcon } from '../shared/ThemedFileIcon';

// ---------------------------------------------------------------------------
// Force-directed simulation
// ---------------------------------------------------------------------------

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
  const repulsionStrength = 5000;
  const attractionStrength = 0.05;
  const damping = 0.85;
  const centerPull = 0.01;

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

    // Attraction along edges
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const force = attractionStrength * edge.similarity;
      a.vx += dx * force;
      a.vy += dy * force;
      b.vx -= dx * force;
      b.vy -= dy * force;
    }

    // Center pull
    for (const node of nodes) {
      node.vx -= node.x * centerPull;
      node.vy -= node.y * centerPull;
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

  // Build graph data
  const { simNodes, simEdges } = useMemo(() => {
    if (!wt) return { simNodes: [], simEdges: [] };

    const fileSet = new Set<string>();
    for (const file of wt.files) {
      fileSet.add(file.path);
    }

    const simEdges: SimEdge[] = pairs.map((p) => ({
      source: p.fileA,
      target: p.fileB,
      similarity: p.overallSimilarity,
      pair: p,
    }));

    // Add connected files
    for (const edge of simEdges) {
      fileSet.add(edge.source);
      fileSet.add(edge.target);
    }

    const simNodes: SimNode[] = Array.from(fileSet).map((filePath, i) => {
      const file = wt.files.find((f) => f.path === filePath);
      const totalChanges = file ? file.linesAdded + file.linesRemoved : 0;
      // Spread nodes in a circle initially
      const angle = (i / fileSet.size) * 2 * Math.PI;
      const radius = 150;
      return {
        id: filePath,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        totalChanges,
      };
    });

    // Run simulation
    runSimulation(simNodes, simEdges, 100);

    return { simNodes, simEdges };
  }, [wt, pairs]);

  // Calculate viewport transform to center the graph
  const transform = useMemo(() => {
    if (simNodes.length === 0)
      return { tx: dimensions.width / 2, ty: dimensions.height / 2, scale: 1 };
    const xs = simNodes.map((n) => n.x);
    const ys = simNodes.map((n) => n.y);
    const minX = Math.min(...xs) - 60;
    const maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 60;
    const maxY = Math.max(...ys) + 60;
    const graphW = maxX - minX;
    const graphH = maxY - minY;
    const scale = Math.min(dimensions.width / graphW, dimensions.height / graphH, 1.5) * 0.9;
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

  if (pairs.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-faint text-11">
        No duplication detected
      </div>
    );
  }

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <svg width={dimensions.width} height={dimensions.height}>
        <g transform={`translate(${transform.tx},${transform.ty}) scale(${transform.scale})`}>
          {/* Edges */}
          {simEdges.map((edge) => {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) return null;
            const edgeKey = `${edge.source}::${edge.target}`;
            const isHovered = hoveredEdge === edgeKey;
            const thickness = 1 + edge.similarity * 3;
            const opacity = 0.3 + edge.similarity * 0.7;
            const showLabel = edge.similarity > 0.7 || isHovered;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;

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
                  strokeWidth={12}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredEdge(edgeKey)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  onClick={() => setSelectedEdge(edge.pair)}
                />
                {showLabel && (
                  <text
                    x={mx}
                    y={my - 8}
                    textAnchor="middle"
                    fontSize={10 / transform.scale}
                    fill="var(--color-text-muted, #aaa)"
                  >
                    {Math.round(edge.similarity * 100)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {simNodes.map((node) => {
            const radius = Math.max(16, Math.min(30, 10 + Math.sqrt(node.totalChanges) * 2));
            const hasEdges = simEdges.some((e) => e.source === node.id || e.target === node.id);
            const fileName = node.id.split('/').pop() ?? node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'pointer', opacity: hasEdges ? 1 : 0.4 }}
                onClick={() => handleNodeClick(node.id)}
              >
                <circle
                  r={radius}
                  fill="var(--color-node-file-bg, #1e1e1e)"
                  stroke="var(--color-border-dashed, #444)"
                  strokeWidth={1.5}
                />
                <text
                  y={radius + 12}
                  textAnchor="middle"
                  fontSize={10 / transform.scale}
                  fill="var(--color-text-primary, #ccc)"
                >
                  {fileName.length > 16 ? fileName.slice(0, 14) + '...' : fileName}
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
