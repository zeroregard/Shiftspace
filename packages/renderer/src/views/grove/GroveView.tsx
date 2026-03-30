import React from 'react';
import type { WorktreeState } from '../../types';
import { WorktreeCard } from './components/WorktreeCard';

interface GroveViewProps {
  worktrees: WorktreeState[];
  onRequestBranchList?: (worktreeId: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
}

export const GroveView = React.memo(
  ({
    worktrees,
    onRequestBranchList,
    onFetchBranches,
    onCheckoutBranch,
    onRunAction,
    onStopAction,
    onRunPipeline,
    onSwapBranches,
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
                  onRequestBranchList={onRequestBranchList}
                  onFetchBranches={onFetchBranches}
                  onCheckoutBranch={onCheckoutBranch}
                  onRunAction={onRunAction}
                  onStopAction={onStopAction}
                  onRunPipeline={onRunPipeline}
                  onSwapBranches={onSwapBranches}
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
