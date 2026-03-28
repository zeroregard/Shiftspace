import React, { useState, useRef, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { ViewMode } from '../types';
import { useShiftspaceStore } from '../store';

// Simple organic tree SVG — two stacked triangles (canopy) + thin trunk
const TreeIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="currentColor"
    aria-hidden="true"
    style={{ display: 'block', flexShrink: 0 }}
  >
    {/* Upper canopy */}
    <polygon points="6,0 10,5 2,5" />
    {/* Lower canopy */}
    <polygon points="6,3 11,8.5 1,8.5" />
    {/* Trunk */}
    <rect x="5" y="8.5" width="2" height="3.5" rx="0.5" />
  </svg>
);

const MODES: { id: ViewMode; label: string; icon?: string; svgIcon?: React.ReactNode }[] = [
  { id: 'tree', label: 'Tree', svgIcon: <TreeIcon /> },
  { id: 'simple', label: 'Simple', icon: 'codicon-remove' },
  { id: 'list', label: 'List', icon: 'codicon-list-flat' },
];

interface Props {
  onViewModeChange?: (mode: ViewMode) => void;
}

export const ViewModeSwitcher = React.memo(({ onViewModeChange }: Props) => {
  const viewMode = useShiftspaceStore((s) => s.viewMode);
  const setViewMode = useShiftspaceStore((s) => s.setViewMode);
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = MODES.find((m) => m.id === viewMode) ?? MODES[0];

  const startCloseTimer = () => {
    closeTimerRef.current = setTimeout(() => setOpen(false), 2000);
  };

  const cancelCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => () => cancelCloseTimer(), []);

  const handleSelect = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
    setOpen(false);
  };

  const renderIcon = (m: (typeof MODES)[number], size?: number) =>
    m.svgIcon ? (
      size ? (
        <TreeIcon size={size} />
      ) : (
        m.svgIcon
      )
    ) : (
      <i
        className={`codicon ${m.icon} shrink-0`}
        style={{ fontSize: size ?? 12 }}
        aria-hidden="true"
      />
    );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-dashed bg-cluster text-text-muted hover:text-text-primary hover:border-text-muted text-10 cursor-pointer transition-colors"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={cancelCloseTimer}
          title="Switch view mode"
        >
          {renderIcon(current, 11)}
          <i className="codicon codicon-chevron-down" style={{ fontSize: 10 }} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-24 rounded-lg border border-border-default bg-node-file p-1 shadow-lg animate-popover-open"
          align="end"
          sideOffset={4}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={cancelCloseTimer}
          onMouseLeave={startCloseTimer}
        >
          {MODES.map((m) => {
            const isActive = viewMode === m.id;
            return (
              <button
                key={m.id}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer border-none bg-transparent hover:bg-item-hover transition-colors ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}
                onClick={() => handleSelect(m.id)}
              >
                {renderIcon(m, 12)}
                <span className="text-13">{m.label}</span>
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});

ViewModeSwitcher.displayName = 'ViewModeSwitcher';
