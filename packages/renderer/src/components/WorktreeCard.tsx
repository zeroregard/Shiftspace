import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { WorktreeState } from '../types';
import { useShiftspaceStore } from '../store';
import { BranchPickerPopover } from './BranchPickerPopover';
import { GitBranchIcon } from '../icons';
import { ActionBar } from './ActionBar';
import { CheckRow } from './CheckRow';
import { filterCheckoutableBranches } from '../utils/worktreeUtils';

const EMPTY_BRANCHES: string[] = [];

interface WorktreeCardProps {
  worktree: WorktreeState;
  onRequestBranchList?: (worktreeId: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
}

export const WorktreeCard = React.memo(
  ({
    worktree: wt,
    onRequestBranchList,
    onFetchBranches,
    onCheckoutBranch,
    onRunAction,
    onStopAction,
    onRunPipeline,
  }: WorktreeCardProps) => {
    const enterInspection = useShiftspaceStore((s) => s.enterInspection);
    const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
    const isFetchingBranches = useShiftspaceStore((s) => s.fetchLoading.has(wt.id));
    const lastFetchAt = useShiftspaceStore((s) => s.lastFetchAt.get(wt.id));
    const occupiedBranches = useShiftspaceStore(
      useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
    );

    const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
    const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
    const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
    const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;

    return (
      <div className="w-64 flex flex-col gap-3 p-4 rounded-xl border-2 border-dashed border-border-dashed bg-cluster-alpha text-text-primary transition-colors">
        {/* Workspace name + branch picker */}
        <div className="flex flex-col gap-0.5">
          <button
            className="font-semibold text-13 text-text-primary truncate text-left bg-transparent border-none p-0 cursor-pointer hover:text-text-secondary transition-colors"
            onClick={() => enterInspection(wt.id)}
          >
            {folderName}
          </button>
          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <BranchPickerPopover
              trigger={
                <button
                  className="flex items-center gap-1 text-text-muted hover:text-text-primary cursor-pointer bg-transparent border-none p-0 text-11"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  title="Switch branch"
                >
                  <GitBranchIcon />
                  <span className="truncate">{wt.branch}</span>
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
        </div>

        {/* Action buttons */}
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <ActionBar worktreeId={wt.id} onRunAction={onRunAction} onStopAction={onStopAction} />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-11">
          <span className="text-text-muted">
            {wt.files.length} file{wt.files.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-status-added">+{totalAdded}</span>
            <span className="text-status-deleted">-{totalRemoved}</span>
          </span>
        </div>

        {/* Check status indicators */}
        <CheckRow
          worktreeId={wt.id}
          onRunAction={onRunAction}
          onStopAction={onStopAction}
          onRunPipeline={onRunPipeline}
        />
      </div>
    );
  }
);

WorktreeCard.displayName = 'WorktreeCard';
