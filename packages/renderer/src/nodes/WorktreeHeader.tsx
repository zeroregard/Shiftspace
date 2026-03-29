import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { WorktreeState } from '../types';
import { useShiftspaceStore } from '../store';
import { BranchPickerPopover } from '../overlays/BranchPickerPopover';
import { filterCheckoutableBranches } from '../utils/worktreeUtils';
import { GitBranchIcon, SwapIcon } from '../icons';

const EMPTY_BRANCHES: string[] = [];

export interface WorktreeHeaderProps {
  worktree: WorktreeState;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
}

export const WorktreeHeader = React.memo(
  ({
    worktree: wt,
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onSwapBranches,
  }: WorktreeHeaderProps) => {
    const isSingle = useShiftspaceStore((s) => s.worktrees.size <= 1);
    const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
    const isFetchingBranches = useShiftspaceStore((s) => s.fetchLoading.has(wt.id));
    const lastFetchAt = useShiftspaceStore((s) => s.lastFetchAt.get(wt.id));
    const occupiedBranches = useShiftspaceStore(
      useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
    );

    const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
    const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
    const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
    // Show folder prefix only for linked (non-main) worktrees when multiple are visible
    const pathPart = !isSingle && !wt.isMainWorktree ? folderName : null;
    const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);

    return (
      <div className="flex flex-col gap-1">
        <div className="font-semibold text-text-primary text-13 whitespace-nowrap flex items-center gap-1">
          {pathPart && <span>{pathPart} </span>}
          <BranchPickerPopover
            trigger={
              <button
                className="flex items-center gap-1 text-text-faint hover:text-text-primary cursor-pointer bg-transparent border-none p-0 text-13 font-semibold"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                title="Switch branch"
              >
                <GitBranchIcon />
                {pathPart ? `(${wt.branch})` : wt.branch}
              </button>
            }
            branches={checkoutBranches}
            selectedBranch={wt.branch}
            onSelectBranch={(branch) => onCheckoutBranch?.(wt.id, branch)}
            onOpen={() => onRequestBranchList?.(wt.id)}
            onFetch={onFetchBranches ? () => onFetchBranches!(wt.id) : undefined}
            isFetching={isFetchingBranches}
            lastFetchAt={lastFetchAt}
          />
        </div>
        <div className="flex gap-1 mt-1">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1 shrink-0">
              {/* Swap button — only for linked (non-main) worktrees */}
              {!wt.isMainWorktree && onSwapBranches && (
                <button
                  className="flex items-center justify-center w-6 h-6 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer bg-transparent"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwapBranches(wt.id);
                  }}
                  title="Swap branch with primary worktree"
                >
                  <SwapIcon />
                </button>
              )}
            </div>
            <div className="ml-2 text-11 text-text-muted">
              {wt.files.length} file{wt.files.length !== 1 ? 's' : ''} ·{' '}
              <span className="text-status-added">+{totalAdded}</span>{' '}
              <span className="text-status-deleted">-{totalRemoved}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

WorktreeHeader.displayName = 'WorktreeHeader';
