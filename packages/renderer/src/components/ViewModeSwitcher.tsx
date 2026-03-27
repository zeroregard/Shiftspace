import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { ViewMode } from '../types';
import { useShiftspaceStore } from '../store';

const MODES: { id: ViewMode; label: string; icon: string; description: string }[] = [
  { id: 'tree', label: 'Tree', icon: 'codicon-list-tree', description: 'Full tree visualization' },
  { id: 'slim', label: 'Slim', icon: 'codicon-pulse', description: 'Headers only' },
  { id: 'list', label: 'List', icon: 'codicon-list-flat', description: 'Flat file list' },
  {
    id: 'heatmap',
    label: 'Heat',
    icon: 'codicon-flame',
    description: 'Folders colored by change intensity',
  },
];

interface Props {
  onViewModeChange?: (mode: ViewMode) => void;
}

export const ViewModeSwitcher = React.memo(({ onViewModeChange }: Props) => {
  const viewMode = useShiftspaceStore((s) => s.viewMode);
  const setViewMode = useShiftspaceStore((s) => s.setViewMode);
  const [open, setOpen] = useState(false);

  const current = MODES.find((m) => m.id === viewMode) ?? MODES[0];

  const handleSelect = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-dashed bg-cluster text-text-muted hover:text-text-primary hover:border-text-muted text-10 cursor-pointer transition-colors"
          onPointerDown={(e) => e.stopPropagation()}
          title="Switch view mode"
        >
          <i className={`codicon ${current.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
          <span>{current.label}</span>
          <i className="codicon codicon-chevron-down" style={{ fontSize: 10 }} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-52 rounded-lg border border-border-default bg-node-file p-1 shadow-lg animate-popover-open"
          align="end"
          sideOffset={4}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {MODES.map((m) => {
            const isActive = viewMode === m.id;
            return (
              <button
                key={m.id}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer border-none bg-transparent hover:bg-item-hover transition-colors ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}
                onClick={() => handleSelect(m.id)}
              >
                <span className="w-3 text-center text-11 shrink-0">{isActive ? '✓' : ''}</span>
                <i
                  className={`codicon ${m.icon} shrink-0`}
                  style={{ fontSize: 12 }}
                  aria-hidden="true"
                />
                <span className="text-13">{m.label}</span>
                <span className="text-10 text-text-faint ml-auto">{m.description}</span>
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});

ViewModeSwitcher.displayName = 'ViewModeSwitcher';
