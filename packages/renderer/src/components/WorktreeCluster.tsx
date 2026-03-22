import React from 'react';
import type { WorktreeState } from '../types';

interface Props {
  worktree: WorktreeState;
  onClick?: () => void;
}

export const WorktreeCluster = React.memo(({ worktree, onClick }: Props) => {
  const totalFiles = worktree.files.length;
  const totalAdded = worktree.files.reduce((sum, f) => sum + f.linesAdded, 0);
  const totalRemoved = worktree.files.reduce((sum, f) => sum + f.linesRemoved, 0);

  return (
    <div
      onClick={onClick}
      className={`border border-border-default rounded-xl px-4 py-3 bg-cluster min-w-[180px]${onClick ? ' cursor-pointer' : ' cursor-default'}`}
    >
      <div className="text-[13px] font-semibold text-text-primary mb-1">
        {worktree.branch}
      </div>
      <div className="text-[11px] text-text-faint mb-2">{worktree.path}</div>
      <div className="text-[11px] text-text-muted">
        {totalFiles} file{totalFiles !== 1 ? 's' : ''} changed
        {' · '}
        <span className="text-status-added">+{totalAdded}</span>{' '}
        <span className="text-status-deleted">-{totalRemoved}</span>
      </div>
      {worktree.process && (
        <div className="mt-2 text-[11px] text-teal bg-process-badge rounded px-[6px] py-[2px] inline-block">
          :{worktree.process.port}
        </div>
      )}
    </div>
  );
});

WorktreeCluster.displayName = 'WorktreeCluster';
