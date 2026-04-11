import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Codicon } from '@shiftspace/ui/codicon';
import { Tooltip } from '@shiftspace/ui/tooltip';
import { useWorktreeStore } from '../store/worktree-store';
import type { WorktreeSortMode } from '../types';

const SORT_OPTIONS: Array<{ value: WorktreeSortMode; label: string }> = [
  { value: 'last-updated', label: 'Last updated' },
  { value: 'name', label: 'Name (A\u2013Z)' },
  { value: 'branch', label: 'Branch (A\u2013Z)' },
];

interface SortPickerProps {
  /** Called when the user picks a sort mode — use to broadcast to other views. */
  onSortChange?: (mode: WorktreeSortMode) => void;
}

export const SortPicker = React.memo(function SortPicker({
  onSortChange,
}: SortPickerProps = {}) {
  const [open, setOpen] = useState(false);
  const sortMode = useWorktreeStore((s) => s.sortMode);
  const setSortMode = useWorktreeStore((s) => s.setSortMode);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content="Sort worktrees" delayDuration={300}>
        <Popover.Trigger asChild>
          <button
            className="flex items-center justify-center w-6 h-6 rounded border border-transparent text-text-muted hover:text-text-primary hover:border-border-dashed bg-transparent cursor-pointer transition-colors shrink-0"
            aria-label="Sort worktrees"
            data-testid="sort-worktrees"
          >
            <Codicon name="three-bars" size={12} />
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-48 rounded-lg border border-border-default bg-node-file p-1 shadow-lg animate-popover-open"
          align="start"
          sideOffset={4}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-13 text-left cursor-pointer border-none bg-transparent hover:bg-item-hover ${sortMode === opt.value ? 'text-text-primary' : 'text-text-secondary'}`}
              data-testid={`sort-${opt.value}`}
              onClick={() => {
                setSortMode(opt.value);
                onSortChange?.(opt.value);
                setOpen(false);
              }}
            >
              <span className="w-3 text-center text-11 shrink-0">
                {sortMode === opt.value ? '\u2713' : ''}
              </span>
              {opt.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
