import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface LayoutNode {
  id: string;
  type: 'worktreeNode' | 'folderNode' | 'fileNode';
  position: { x: number; y: number };
  width: number;
  height: number;
  data: Record<string, unknown>;
  style?: React.CSSProperties;
  /** Short label shown as a floating badge when the node header scrolls out of view. */
  label?: string;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  style?: React.CSSProperties;
}

export interface NodeComponentProps<T = Record<string, unknown>> {
  data: T;
}

interface Transform {
  x: number;
  y: number;
  zoom: number;
}

export interface PanZoomConfig {
  /** Modifier keys that trigger zoom on scroll. Default: ['ctrl', 'meta'] (Figma-style). */
  zoomModifiers?: Array<'ctrl' | 'meta' | 'alt'>;
  /** Sensitivity for trackpad pinch (ctrlKey, small deltaY values). Default: 0.01. */
  pinchSensitivity?: number;
  /** Sensitivity for modifier+scroll wheel (large deltaY values). Default: 0.001. */
  wheelSensitivity?: number;
  maxZoom?: number;
  minZoom?: number;
}

const DEFAULT_PAN_ZOOM_CONFIG: Required<PanZoomConfig> = {
  zoomModifiers: ['ctrl', 'meta'],
  pinchSensitivity: 0.01,
  wheelSensitivity: 0.001,
  maxZoom: 3,
  minZoom: 0.1,
};

interface TreeCanvasProps {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  nodeTypes: Record<string, React.ComponentType<NodeComponentProps<any>>>;
  panZoomConfig?: PanZoomConfig;
}

function smoothstepPath(x1: number, y1: number, x2: number, y2: number): string {
  const d = Math.max(Math.abs(y2 - y1) * 0.5, 30);
  return `M ${x1},${y1} C ${x1},${y1 + d} ${x2},${y2 - d} ${x2},${y2}`;
}

function fitViewToNodes(nodes: LayoutNode[], w: number, h: number): Transform {
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 };
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...nodes.map((n) => n.position.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.position.y + n.height));
  const PADDING = 40;
  const zoom = Math.min((w - PADDING * 2) / (maxX - minX), (h - PADDING * 2) / (maxY - minY), 1);
  return {
    zoom,
    x: (w - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (h - (maxY - minY) * zoom) / 2 - minY * zoom,
  };
}

interface EdgePathProps {
  edge: LayoutEdge;
  nodeMap: Map<string, LayoutNode>;
}

const EdgePath = React.memo(({ edge, nodeMap }: EdgePathProps) => {
  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);
  if (!source || !target) return null;

  const x1 = source.position.x + source.width / 2;
  const y1 = source.position.y + source.height;
  const x2 = target.position.x + target.width / 2;
  const y2 = target.position.y;

  return (
    <path
      d={smoothstepPath(x1, y1, x2, y2)}
      fill="none"
      stroke={(edge.style?.stroke as string) ?? 'var(--color-border-dashed)'}
      strokeWidth={(edge.style?.strokeWidth as number) ?? 1}
    />
  );
});
EdgePath.displayName = 'EdgePath';

interface NodeWrapperProps {
  node: LayoutNode;
  nodeTypes: Record<string, React.ComponentType<NodeComponentProps<any>>>;
}

const NodeWrapper = React.memo(({ node, nodeTypes }: NodeWrapperProps) => {
  const Component = nodeTypes[node.type];
  if (!Component) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: node.width,
        height: node.height,
        boxSizing: 'border-box',
        ...node.style,
      }}
    >
      <Component data={node.data} />
    </div>
  );
});
NodeWrapper.displayName = 'NodeWrapper';

export const TreeCanvas: React.FC<TreeCanvasProps> = ({
  nodes,
  edges,
  nodeTypes,
  panZoomConfig,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, zoom: 1 });
  const [isFitting, setIsFitting] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const lastTouchDistRef = useRef<number | null>(null);
  const hasFitRef = useRef(false);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  // Track active pointers to prevent panning during pinch
  const activePointersRef = useRef<Set<number>>(new Set());
  // Keep nodes accessible in event handlers without stale closures
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Merge config with defaults via ref so handlers never need re-registration
  const panZoomConfigRef = useRef<Required<PanZoomConfig>>(DEFAULT_PAN_ZOOM_CONFIG);
  panZoomConfigRef.current = { ...DEFAULT_PAN_ZOOM_CONFIG, ...panZoomConfig };

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // fitView on first data load
  useEffect(() => {
    if (hasFitRef.current || nodes.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    setTransform(fitViewToNodes(nodes, w, h));
    hasFitRef.current = true;
  }, [nodes]);

  // Wheel handler — non-passive so we can preventDefault
  // Figma-style: scroll=pan, shift+scroll=horizontal pan, cmd/ctrl+scroll=zoom, pinch=zoom
  useEffect(() => {
    const el = containerRef.current!;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const cfg = panZoomConfigRef.current;
      const isZoom = cfg.zoomModifiers.some(
        (mod) =>
          (mod === 'ctrl' && e.ctrlKey) ||
          (mod === 'meta' && e.metaKey) ||
          (mod === 'alt' && e.altKey)
      );
      if (isZoom) {
        const sensitivity = e.ctrlKey ? cfg.pinchSensitivity : cfg.wheelSensitivity;
        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        setTransform((prev) => {
          const newZoom = Math.min(
            Math.max(prev.zoom * (1 - e.deltaY * sensitivity), cfg.minZoom),
            cfg.maxZoom
          );
          const canvasX = (cursorX - prev.x) / prev.zoom;
          const canvasY = (cursorY - prev.y) / prev.zoom;
          return { zoom: newZoom, x: cursorX - canvasX * newZoom, y: cursorY - canvasY * newZoom };
        });
      } else if (e.shiftKey) {
        // Shift+scroll → horizontal pan
        // On macOS the OS converts Shift+scroll to deltaX before the event arrives,
        // so fall back to deltaY only when deltaX is absent (other platforms).
        const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        setTransform((prev) => ({ ...prev, x: prev.x - dx }));
      } else {
        // Plain scroll/swipe → pan
        setTransform((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Touch events — non-passive to allow preventDefault during pinch
  useEffect(() => {
    const el = containerRef.current!;

    function getTouchDist(e: TouchEvent): number {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.hypot(dx, dy);
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastTouchDistRef.current = getTouchDist(e);
        // Cancel any ongoing pan so pinch doesn't also drag
        isPanningRef.current = false;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
        e.preventDefault();
        const newDist = getTouchDist(e);
        // Capture prevDist as a local variable and update the ref immediately.
        // The setTransform updater runs asynchronously (React 18 batching), so reading
        // lastTouchDistRef.current inside the updater would yield newDist/newDist = 1.
        const prevDist = lastTouchDistRef.current;
        lastTouchDistRef.current = newDist;
        const rect = el.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        setTransform((prev) => {
          const { minZoom, maxZoom } = panZoomConfigRef.current;
          const newZoom = Math.min(Math.max(prev.zoom * (newDist / prevDist), minZoom), maxZoom);
          const canvasX = (midX - prev.x) / prev.zoom;
          const canvasY = (midY - prev.y) / prev.zoom;
          return { zoom: newZoom, x: midX - canvasX * newZoom, y: midY - canvasY * newZoom };
        });
      }
    }

    function handleTouchEnd() {
      lastTouchDistRef.current = null;
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    activePointersRef.current.add(e.pointerId);
    // Don't start panning when multiple pointers are active (pinch gesture)
    if (activePointersRef.current.size > 1) {
      isPanningRef.current = false;
      return;
    }
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transformRef.current.x,
      ty: transformRef.current.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    // Skip panning when multiple pointers are active (pinch in progress)
    if (!isPanningRef.current || activePointersRef.current.size > 1) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setTransform((prev) => ({
      ...prev,
      x: panStartRef.current.tx + dx,
      y: panStartRef.current.ty + dy,
    }));
  }

  function handlePointerUp(e: React.PointerEvent) {
    activePointersRef.current.delete(e.pointerId);
    isPanningRef.current = false;
  }

  function handlePointerCancel(e: React.PointerEvent) {
    activePointersRef.current.delete(e.pointerId);
    isPanningRef.current = false;
  }

  function handleFitView(e: React.MouseEvent) {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    setIsFitting(true);
    setTransform(fitViewToNodes(nodesRef.current, w, h));
  }

  const handleTransitionEnd = useCallback(() => {
    setIsFitting(false);
  }, []);

  const { x, y, zoom } = transform;
  const dotOpacity = Math.min(1, Math.max(0.05, zoom * 0.7));

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        cursor: 'grab',
        touchAction: 'none',
        backgroundImage: `radial-gradient(circle, rgba(42, 42, 58, ${dotOpacity}) 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${x}px ${y}px`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        style={{
          transform: `translate(${x}px,${y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          transition: isFitting ? 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Worktree containers render first (bottom layer) */}
        {nodes
          .filter((n) => n.type === 'worktreeNode')
          .map((node) => (
            <NodeWrapper key={node.id} node={node} nodeTypes={nodeTypes} />
          ))}
        {/* SVG edges render above containers but below folder/file nodes.
            Must have real dimensions — Chromium clips overflow:visible SVGs
            to a 0×0 viewport (unlike Safari which renders them anyway). */}
        <svg
          style={{
            position: 'absolute',
            overflow: 'visible',
            pointerEvents: 'none',
            width: Math.max(...nodes.map((n) => n.position.x + n.width), 0),
            height: Math.max(...nodes.map((n) => n.position.y + n.height), 0),
          }}
        >
          {edges.map((edge) => (
            <EdgePath key={edge.id} edge={edge} nodeMap={nodeMap} />
          ))}
        </svg>
        {/* Folder and file nodes render on top */}
        {nodes
          .filter((n) => n.type !== 'worktreeNode')
          .map((node) => (
            <NodeWrapper key={node.id} node={node} nodeTypes={nodeTypes} />
          ))}
      </div>
      {/* Fit-view reset button — outside the transform so it stays fixed in corner */}
      <button
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 10,
          background: 'var(--color-node-file)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 6,
          padding: '5px 10px',
          cursor: 'pointer',
          color: 'var(--color-text-secondary)',
          fontSize: 11,
          lineHeight: 1,
          userSelect: 'none',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleFitView}
        title="Reset view"
      >
        Fit
      </button>
    </div>
  );
};
