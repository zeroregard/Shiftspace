import React from 'react';
import type { NodeComponentProps } from '../TreeCanvas';
import type { WorktreeState } from '../types';
import { useShiftspaceStore } from '../store';

export interface WorktreeNodeData {
  worktree: WorktreeState;
  [key: string]: unknown;
}

export const WorktreeNode = React.memo(({ data }: NodeComponentProps<WorktreeNodeData>) => {
  const wt = data.worktree;
  const isSingle = useShiftspaceStore((s) => s.worktrees.size <= 1);
  const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
  const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
  const isMain = wt.branch === 'main' || wt.branch === 'master';
  const pathPart = isMain ? null : folderName;

  return (
    <div className="w-full h-full border-2 border-dashed border-border-dashed rounded-2xl bg-cluster-alpha text-text-primary px-7.5 py-5 text-left">
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
  );
});

WorktreeNode.displayName = 'WorktreeNode';
