import React, { useState, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { NodeComponentProps } from '../TreeCanvas';
import type { WorktreeState, DiffMode } from '../types';
import { useShiftspaceStore } from '../store';

export interface WorktreeNodeData {
  worktree: WorktreeState;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  [key: string]: unknown;
}

const GitCompareIcon = React.memo(() => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM4 5a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM11 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-1 2a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z"
    />
    <path
      d="M5 7v1.5a2.5 2.5 0 0 0 2.5 2.5H9m2-4V5.5A2.5 2.5 0 0 0 8.5 3H7"
      stroke="currentColor"
      strokeWidth="1"
      fill="none"
    />
    <path
      d="M7 1.5 5.5 3 7 4.5"
      stroke="currentColor"
      strokeWidth="1"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 11.5l1.5 1.5L9 14.5"
      stroke="currentColor"
      strokeWidth="1"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
));
GitCompareIcon.displayName = 'GitCompareIcon';

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

export const WorktreeNode = React.memo(({ data }: NodeComponentProps<WorktreeNodeData>) => {
  const wt = data.worktree;
  const isSingle = useShiftspaceStore((s) => s.worktrees.size <= 1);
  const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? []);
  const isLoading = useShiftspaceStore((s) => s.diffModeLoading.has(wt.id));

  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
  const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
  const isMain = wt.branch === 'main' || wt.branch === 'master';
  const pathPart = isMain ? null : folderName;

  const diffMode: DiffMode = wt.diffMode ?? { type: 'working' };
  const defaultBranch = wt.defaultBranch ?? 'main';

  const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;

  const filteredBranches = branchList
    .filter((b) => !searchQuery || b.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 10);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      data.onRequestBranchList?.(wt.id);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  };

  const selectMode = (newMode: DiffMode) => {
    if (!isDiffModeEqual(newMode, diffMode)) {
      data.onDiffModeChange?.(wt.id, newMode);
    }
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="w-full h-full border-2 border-dashed border-border-dashed rounded-2xl bg-cluster-alpha text-text-primary px-7.5 py-5 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-text-primary text-13 whitespace-nowrap">
            {!isSingle && pathPart && <span>{pathPart} </span>}
            {!isSingle && pathPart ? (
              <>
                (<span className="text-text-faint font-normal">{wt.branch}</span>)
              </>
            ) : (
              <span className="text-text-muted font-normal">{wt.branch}</span>
            )}
          </div>
          <div className="text-11 text-text-muted mt-0.5">
            {wt.files.length} file{wt.files.length !== 1 ? 's' : ''} ·{' '}
            <span className="text-status-added">+{totalAdded}</span>{' '}
            <span className="text-status-deleted">-{totalRemoved}</span>
          </div>
          {wt.process && (
            <div className="mt-1 text-10 text-teal bg-process-badge rounded-sm px-1 py-px inline-block">
              :{wt.process.port}
            </div>
          )}
        </div>

        {/* Diff mode selector */}
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger asChild>
            <button
              className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted text-10 whitespace-nowrap cursor-pointer bg-transparent shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <GitCompareIcon />
              <span style={{ opacity: isLoading ? 0.5 : 1 }}>{modeLabel}</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-52 rounded-lg border border-border-dashed bg-[#161b22] p-1 shadow-lg"
              align="end"
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Search input */}
              <div className="px-1.5 py-1 mb-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search branches…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border border-border-dashed rounded px-2 py-1 text-11 text-text-primary outline-none placeholder:text-text-muted"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false);
                    e.stopPropagation();
                  }}
                />
              </div>

              {/* Working changes option */}
              {(!searchQuery || 'working changes'.includes(searchQuery.toLowerCase())) && (
                <button
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-11 text-left cursor-pointer border-none bg-transparent hover:bg-[rgba(255,255,255,0.06)] ${diffMode.type === 'working' ? 'text-text-primary' : 'text-text-muted'}`}
                  onClick={() => selectMode({ type: 'working' })}
                >
                  <span className="w-3 text-center text-10">
                    {diffMode.type === 'working' ? '✓' : ''}
                  </span>
                  Working changes
                </button>
              )}

              {/* Default branch option (always visible when not searching) */}
              {!searchQuery && (
                <button
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-11 text-left cursor-pointer border-none bg-transparent hover:bg-[rgba(255,255,255,0.06)] ${isDiffModeEqual(diffMode, { type: 'branch', branch: defaultBranch }) ? 'text-text-primary' : 'text-text-muted'}`}
                  onClick={() => selectMode({ type: 'branch', branch: defaultBranch })}
                >
                  <span className="w-3 text-center text-10">
                    {isDiffModeEqual(diffMode, { type: 'branch', branch: defaultBranch })
                      ? '✓'
                      : ''}
                  </span>
                  vs {defaultBranch}
                </button>
              )}

              {/* Separator */}
              {filteredBranches.length > 0 && (
                <div className="my-1 border-t border-[rgba(255,255,255,0.06)]" />
              )}

              {/* Filtered branch list */}
              {filteredBranches
                .filter((b) => searchQuery || b !== defaultBranch) // Don't duplicate default when not searching
                .map((b) => (
                  <button
                    key={b}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-11 text-left cursor-pointer border-none bg-transparent hover:bg-[rgba(255,255,255,0.06)] ${isDiffModeEqual(diffMode, { type: 'branch', branch: b }) ? 'text-text-primary' : 'text-text-muted'}`}
                    onClick={() => selectMode({ type: 'branch', branch: b })}
                  >
                    <span className="w-3 text-center text-10">
                      {isDiffModeEqual(diffMode, { type: 'branch', branch: b }) ? '✓' : ''}
                    </span>
                    vs {b}
                  </button>
                ))}

              {/* Note */}
              <div className="mt-1 px-2 py-1 text-[10px] text-text-faint border-t border-[rgba(255,255,255,0.06)]">
                Tags and commit hashes not yet supported
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
});

WorktreeNode.displayName = 'WorktreeNode';
