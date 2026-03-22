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
      style={{
        border: '1px solid #3a3a4a',
        borderRadius: 12,
        padding: '12px 16px',
        background: '#1a1a2e',
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0ff', marginBottom: 4 }}>
        {worktree.branch}
      </div>
      <div style={{ fontSize: 11, color: '#6b6b8a', marginBottom: 8 }}>
        {worktree.path}
      </div>
      <div style={{ fontSize: 11, color: '#9a9ab0' }}>
        {totalFiles} file{totalFiles !== 1 ? 's' : ''} changed
        {' · '}
        <span style={{ color: '#4ec94e' }}>+{totalAdded}</span>
        {' '}
        <span style={{ color: '#e05c5c' }}>-{totalRemoved}</span>
      </div>
      {worktree.process && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#4ec9b0',
            background: '#0d2d26',
            borderRadius: 4,
            padding: '2px 6px',
            display: 'inline-block',
          }}
        >
          :{worktree.process.port}
        </div>
      )}
    </div>
  );
});

WorktreeCluster.displayName = 'WorktreeCluster';
