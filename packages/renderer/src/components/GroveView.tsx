import React from 'react';
import type { WorktreeState, DiffMode } from '../types';
import { WorktreeCard } from './WorktreeCard';

interface GroveViewProps {
  worktrees: WorktreeState[];
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
}

export const GroveView = React.memo(
  ({
    worktrees,
    onDiffModeChange,
    onRequestBranchList,
    onFetchBranches,
    onCheckoutBranch,
    onRunAction,
    onStopAction,
    onRunPipeline,
  }: GroveViewProps) => {
    return (
      <div className="w-full h-full overflow-auto">
        <div className="p-6">
          {worktrees.length === 0 ? (
            <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
          ) : (
            <div className="flex flex-row flex-wrap gap-4 items-start">
              {worktrees.map((wt) => (
                <WorktreeCard
                  key={wt.id}
                  worktree={wt}
                  onDiffModeChange={onDiffModeChange}
                  onRequestBranchList={onRequestBranchList}
                  onFetchBranches={onFetchBranches}
                  onCheckoutBranch={onCheckoutBranch}
                  onRunAction={onRunAction}
                  onStopAction={onStopAction}
                  onRunPipeline={onRunPipeline}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

GroveView.displayName = 'GroveView';
