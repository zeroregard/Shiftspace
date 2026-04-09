import React, { useEffect, useRef, useState } from 'react';
import type { PanZoomConfig } from '../tree-canvas';
import type { LayoutNode } from '../tree-canvas';
import { useCanvasGestures } from './use-canvas-gestures';

interface Transform {
  x: number;
  y: number;
  zoom: number;
}

function fitViewToNodes(nodes: LayoutNode[], w: number, h: number): Transform {
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + n.width);
    maxY = Math.max(maxY, n.position.y + n.height);
  }
  const PADDING = 40;
  const zoom = Math.min((w - PADDING * 2) / (maxX - minX), (h - PADDING * 2) / (maxY - minY), 1);
  return {
    zoom,
    x: (w - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (h - (maxY - minY) * zoom) / 2 - minY * zoom,
  };
}

interface UsePanZoomResult {
  containerRef: React.RefObject<HTMLDivElement>;
  transform: Transform;
  isFitting: boolean;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handlePointerCancel: (e: React.PointerEvent) => void;
  handleFitView: (e: React.MouseEvent) => void;
  handleTransitionEnd: () => void;
}

interface UsePanZoomOptions {
  nodes: LayoutNode[];
  panZoomConfig?: PanZoomConfig;
  focusNodeId?: string | null;
  onFocusComplete?: () => void;
}

export function usePanZoom({
  nodes,
  panZoomConfig,
  focusNodeId,
  onFocusComplete,
}: UsePanZoomOptions): UsePanZoomResult {
  const containerRef = useRef<HTMLDivElement>(null!);

  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, zoom: 1 });
  const [isFitting, setIsFitting] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const hasFitRef = useRef(false);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const activePointersRef = useRef<Set<number>>(new Set());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const isFocusingRef = useRef(false);
  const onFocusCompleteRef = useRef(onFocusComplete);
  onFocusCompleteRef.current = onFocusComplete;

  // Delegate wheel + touch gestures to a separate hook
  useCanvasGestures({ containerRef, panZoomConfig, isPanningRef, setTransform });

  // fitView on first data load
  useEffect(() => {
    if (hasFitRef.current || nodes.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    setTransform(fitViewToNodes(nodes, w, h));
    hasFitRef.current = true;
  }, [nodes]);

  // Focus on a specific node when focusNodeId changes
  useEffect(() => {
    if (!focusNodeId) return;
    const node = nodesRef.current.find((n) => n.id === focusNodeId);
    if (!node) return;
    const el = containerRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const targetZoom = Math.max(transformRef.current.zoom, 0.8);
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;
    isFocusingRef.current = true;
    setIsFitting(true);
    setTransform({
      zoom: targetZoom,
      x: w / 2 - centerX * targetZoom,
      y: h / 2 - centerY * targetZoom,
    });
  }, [focusNodeId]);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    activePointersRef.current.add(e.pointerId);
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

  const handleTransitionEnd = () => {
    setIsFitting(false);
    if (isFocusingRef.current) {
      isFocusingRef.current = false;
      onFocusCompleteRef.current?.();
    }
  };

  return {
    containerRef,
    transform,
    isFitting,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleFitView,
    handleTransitionEnd,
  };
}
