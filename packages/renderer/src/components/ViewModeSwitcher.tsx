import React from 'react';
import type { ViewMode } from '../types';
import { useShiftspaceStore } from '../store';

const MODES: { id: ViewMode; label: string; icon: string; title: string }[] = [
  { id: 'tree', label: 'Tree', icon: 'codicon-list-tree', title: 'Tree view' },
  { id: 'slim', label: 'Slim', icon: 'codicon-pulse', title: 'Slim view — headers only' },
  { id: 'list', label: 'List', icon: 'codicon-list-flat', title: 'List view — flat file list' },
  {
    id: 'heatmap',
    label: 'Heat',
    icon: 'codicon-flame',
    title: 'Heatmap view — folders colored by change intensity',
  },
];

interface Props {
  onViewModeChange?: (mode: ViewMode) => void;
}

export const ViewModeSwitcher = React.memo(({ onViewModeChange }: Props) => {
  const viewMode = useShiftspaceStore((s) => s.viewMode);
  const setViewMode = useShiftspaceStore((s) => s.setViewMode);

  const handleSelect = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
  };

  return (
    <div
      className="flex items-center gap-px bg-cluster rounded-md border border-border-dashed p-0.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {MODES.map((m) => {
        const isActive = viewMode === m.id;
        return (
          <button
            key={m.id}
            title={m.title}
            onClick={() => handleSelect(m.id)}
            className={[
              'flex items-center gap-1 px-2 py-1 rounded text-10 cursor-pointer border-none transition-colors',
              isActive
                ? 'bg-border-default text-text-primary'
                : 'bg-transparent text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            <i className={`codicon ${m.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
});

ViewModeSwitcher.displayName = 'ViewModeSwitcher';
