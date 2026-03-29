import React from 'react';
import type { NodeComponentProps } from '../TreeCanvas';
import type { WorktreeState } from '../types';
import { WorktreeHeader } from './WorktreeHeader';

export interface WorktreeNodeData {
  worktree: WorktreeState;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  [key: string]: unknown;
}

export const WorktreeNode = React.memo(({ data }: NodeComponentProps<WorktreeNodeData>) => {
  const wt = data.worktree;

  return (
    <div className="w-full h-full border-2 border-dashed border-border-dashed rounded-2xl bg-cluster-alpha text-text-primary px-7.5 py-5 text-left flex flex-col">
      <WorktreeHeader
        worktree={wt}
        onRequestBranchList={data.onRequestBranchList}
        onCheckoutBranch={data.onCheckoutBranch}
        onFetchBranches={data.onFetchBranches}
        onSwapBranches={data.onSwapBranches}
      />
    </div>
  );
});

WorktreeNode.displayName = 'WorktreeNode';
