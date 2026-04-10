import React, { useMemo } from 'react';
import { Button } from '@shiftspace/ui/button';
import { usePanZoom } from './hooks/use-pan-zoom';

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

interface TreeCanvasProps {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  nodeTypes: Record<string, React.ComponentType<NodeComponentProps<any>>>;
  panZoomConfig?: PanZoomConfig;
  /** When set to a node ID, the canvas animates to center on that node. */
  focusNodeId?: string | null;
  /** Called after the focus animation completes (use to reset focusNodeId). */
  onFocusComplete?: () => void;
}

function smoothstepPath(x1: number, y1: number, x2: number, y2: number): string {
  const d = Math.max(Math.abs(y2 - y1) * 0.5, 30);
  return `M ${x1},${y1} C ${x1},${y1 + d} ${x2},${y2 - d} ${x2},${y2}`;
}

interface EdgePathProps {
  edge: LayoutEdge;
  nodeMap: Map<string, LayoutNode>;
}

const EdgePath = React.memo(function EdgePath({ edge, nodeMap }: EdgePathProps) {
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
      stroke={(edge.style?.stroke as string) ?? 'var(--color-edge-stroke)'}
      strokeWidth={(edge.style?.strokeWidth as number) ?? 1}
    />
  );
});

interface NodeWrapperProps {
  node: LayoutNode;
  nodeTypes: Record<string, React.ComponentType<NodeComponentProps<any>>>;
}

const NodeWrapper = React.memo(function NodeWrapper({ node, nodeTypes }: NodeWrapperProps) {
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

export const TreeCanvas: React.FC<TreeCanvasProps> = ({
  nodes,
  edges,
  nodeTypes,
  panZoomConfig,
  focusNodeId,
  onFocusComplete,
}) => {
  const {
    containerRef,
    transform,
    isFitting,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleFitView,
    handleTransitionEnd,
  } = usePanZoom({ nodes, panZoomConfig, focusNodeId, onFocusComplete });

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const svgBounds = useMemo(() => {
    let w = 0;
    let h = 0;
    for (const n of nodes) {
      w = Math.max(w, n.position.x + n.width);
      h = Math.max(h, n.position.y + n.height);
    }
    return { w, h };
  }, [nodes]);

  const worktreeNodes = useMemo(() => nodes.filter((n) => n.type === 'worktreeNode'), [nodes]);
  const contentNodes = useMemo(() => nodes.filter((n) => n.type !== 'worktreeNode'), [nodes]);

  const { x, y, zoom } = transform;
  const dotOpacity = Math.min(1, Math.max(0.05, zoom * 0.7));

  return (
    <div
      ref={containerRef}
      data-testid="tree-canvas"
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        cursor: 'grab',
        touchAction: 'none',
        backgroundImage: `radial-gradient(circle, rgba(var(--color-grid-dot-rgb), ${dotOpacity}) 1px, transparent 1px)`,
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
        {worktreeNodes.map((node) => (
          <NodeWrapper key={node.id} node={node} nodeTypes={nodeTypes} />
        ))}
        <svg
          style={{
            position: 'absolute',
            overflow: 'visible',
            pointerEvents: 'none',
            width: svgBounds.w,
            height: svgBounds.h,
          }}
        >
          {edges.map((edge) => (
            <EdgePath key={edge.id} edge={edge} nodeMap={nodeMap} />
          ))}
        </svg>
        {contentNodes.map((node) => (
          <NodeWrapper key={node.id} node={node} nodeTypes={nodeTypes} />
        ))}
      </div>
      <div
        style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="sm" onClick={handleFitView}>
          Fit
        </Button>
      </div>
    </div>
  );
};
