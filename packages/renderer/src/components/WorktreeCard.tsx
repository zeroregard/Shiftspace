import React from 'react';
import type { WorktreeState, DiffMode } from '../types';
import { useShiftspaceStore } from '../store';
import { BranchPickerPopover } from './BranchPickerPopover';
import { GitCompareIcon } from '../icons';
import { CheckRow } from './CheckRow';

const EMPTY_BRANCHES: string[] = [];

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

interface WorktreeCardProps {
  worktree: WorktreeState;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
}

export const WorktreeCard = React.memo(
  ({
    worktree: wt,
    onDiffModeChange,
    onRequestBranchList,
    onFetchBranches,
    onRunAction,
    onStopAction,
    onRunPipeline,
  }: WorktreeCardProps) => {
    const enterInspection = useShiftspaceStore((s) => s.enterInspection);
    const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
    const isLoading = useShiftspaceStore((s) => s.diffModeLoading.has(wt.id));
    const isFetchingBranches = useShiftspaceStore((s) => s.fetchLoading.has(wt.id));
    const lastFetchAt = useShiftspaceStore((s) => s.lastFetchAt.get(wt.id));

    const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
    const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);

    const diffMode: DiffMode = wt.diffMode ?? { type: 'working' };
    const defaultBranch = wt.defaultBranch ?? 'main';
    const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;

    const diffModeStaticOptions = [
      {
        key: 'working',
        label: 'Working changes',
        selected: diffMode.type === 'working',
        onSelect: () => onDiffModeChange?.(wt.id, { type: 'working' }),
      },
      ...(branchList.includes(defaultBranch) || !defaultBranch
        ? []
        : [
            {
              key: `default-${defaultBranch}`,
              label: `vs ${defaultBranch}`,
              selected: isDiffModeEqual(diffMode, { type: 'branch', branch: defaultBranch }),
              onSelect: () => onDiffModeChange?.(wt.id, { type: 'branch', branch: defaultBranch }),
            },
          ]),
    ];

    const diffModeBranches = branchList.filter((b) => b !== wt.branch);

    const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;

    return (
      <div
        className="w-64 flex flex-col gap-3 p-4 rounded-xl border-2 border-dashed border-border-dashed bg-cluster-alpha hover:bg-cluster text-text-primary cursor-pointer transition-colors"
        onClick={() => enterInspection(wt.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') enterInspection(wt.id);
        }}
      >
        {/* Name + branch */}
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-13 text-text-primary truncate">
            {wt.isMainWorktree ? wt.branch : folderName}
          </span>
          {!wt.isMainWorktree && (
            <span className="text-11 text-text-muted truncate">{wt.branch}</span>
          )}
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

        {/* Diff mode dropdown */}
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <BranchPickerPopover
            trigger={
              <button
                className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted text-10 whitespace-nowrap cursor-pointer bg-transparent"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <GitCompareIcon />
                <span style={{ opacity: isLoading ? 0.5 : 1 }}>{modeLabel}</span>
              </button>
            }
            branches={diffModeBranches}
            selectedBranch={diffMode.type === 'branch' ? diffMode.branch : null}
            staticOptions={diffModeStaticOptions}
            branchLabel={(b) => `vs ${b}`}
            onSelectBranch={(branch) => onDiffModeChange?.(wt.id, { type: 'branch', branch })}
            onOpen={() => onRequestBranchList?.(wt.id)}
            onFetch={onFetchBranches ? () => onFetchBranches!(wt.id) : undefined}
            isFetching={isFetchingBranches}
            lastFetchAt={lastFetchAt}
          />
        </div>
      </div>
    );
  }
);

WorktreeCard.displayName = 'WorktreeCard';
