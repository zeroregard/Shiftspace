import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { WorktreeState } from '../../../types';
import { useShiftspaceStore } from '../../../store';
import { BranchPickerPopover } from '../../../overlays/BranchPickerPopover';
import { GitBranchIcon, SwapIcon, TrashIcon, PencilIcon } from '../../../icons';
import { ActionBar } from '../../inspection/components/ActionBar';
import { filterCheckoutableBranches } from '../../../utils/worktreeUtils';

const EMPTY_BRANCHES: string[] = [];

interface WorktreeCardProps {
  worktree: WorktreeState;
  onRequestBranchList?: (worktreeId: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  onRemoveWorktree?: (worktreeId: string) => void;
  onRenameWorktree?: (worktreeId: string, newName: string) => void;
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
    onSwapBranches,
    onRemoveWorktree,
    onRenameWorktree,
  }: WorktreeCardProps) => {
    const enterInspection = useShiftspaceStore((s) => s.enterInspection);
    const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
    const isFetchingBranches = useShiftspaceStore((s) => s.fetchLoading.has(wt.id));
    const lastFetchAt = useShiftspaceStore((s) => s.lastFetchAt.get(wt.id));
    const occupiedBranches = useShiftspaceStore(
      useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
    );

    const [isRenaming, setIsRenaming] = React.useState(false);
    const [renameValue, setRenameValue] = React.useState('');
    const renameInputRef = React.useRef<HTMLInputElement>(null);

    const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
    const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
    const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
    const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;

    const startRename = () => {
      setRenameValue(folderName);
      setIsRenaming(true);
      setTimeout(() => renameInputRef.current?.select(), 0);
    };

    const commitRename = () => {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== folderName) {
        onRenameWorktree?.(wt.id, trimmed);
      }
      setIsRenaming(false);
    };

    return (
      <div className="group w-[32rem] flex flex-col gap-3 p-4 rounded-xl border-2 border-dashed border-border-dashed bg-cluster-alpha text-text-primary transition-colors">
        {/* Workspace name + branch picker */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="font-semibold text-13 text-text-primary bg-transparent border border-border-dashed rounded px-1 py-0 outline-none flex-1 min-w-0"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
              />
            ) : (
              <button
                className="font-semibold text-13 text-text-primary truncate text-left bg-transparent border-none p-0 cursor-pointer hover:text-text-secondary transition-colors flex-1 min-w-0"
                onClick={() => enterInspection(wt.id)}
              >
                {folderName}
              </button>
            )}
            {!wt.isMainWorktree && !isRenaming && (
              <>
                {onRenameWorktree && (
                  <button
                    className="flex items-center justify-center w-5 h-5 rounded border border-transparent text-text-muted hover:text-text-primary hover:border-border-dashed cursor-pointer bg-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename();
                    }}
                    title="Rename worktree"
                  >
                    <PencilIcon />
                  </button>
                )}
                {onRemoveWorktree && (
                  <button
                    className="flex items-center justify-center w-5 h-5 rounded border border-transparent text-text-muted hover:text-status-deleted hover:border-border-dashed cursor-pointer bg-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveWorktree(wt.id);
                    }}
                    title="Remove worktree"
                  >
                    <TrashIcon />
                  </button>
                )}
              </>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 min-w-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <BranchPickerPopover
              trigger={
                <button
                  className="flex items-center gap-1 min-w-0 max-w-full text-text-muted hover:text-text-primary cursor-pointer bg-transparent border-none p-0 text-11"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  title={wt.branch}
                >
                  <span className="shrink-0">
                    <GitBranchIcon />
                  </span>
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
            {!wt.isMainWorktree && onSwapBranches && (
              <button
                className="flex items-center justify-center w-5 h-5 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer bg-transparent"
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
        </div>

        {/* Action buttons */}
        <div
          className="flex flex-col"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ActionBar
            worktreeId={wt.id}
            onRunAction={onRunAction}
            onStopAction={onStopAction}
            onRunPipeline={onRunPipeline}
          />
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
      </div>
    );
  }
);

WorktreeCard.displayName = 'WorktreeCard';
