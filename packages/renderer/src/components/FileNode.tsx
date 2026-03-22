import React from 'react';
import type { FileChange } from '../types';

interface Props {
  file: FileChange;
  onClick?: () => void;
}

const STATUS_COLORS: Record<FileChange['status'], string> = {
  added: '#4ec94e',
  modified: '#e0c44e',
  deleted: '#e05c5c',
};

export const FileNode = React.memo(({ file, onClick }: Props) => {
  const fileName = file.path.split('/').pop() ?? file.path;
  const isPulsing = Date.now() - file.lastChangedAt < 3000;

  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${file.staged ? '#4a6baa' : '#3a3a4a'}`,
        borderRadius: 6,
        padding: '6px 10px',
        background: isPulsing ? '#1e1e3a' : '#141428',
        cursor: onClick ? 'pointer' : 'default',
        opacity: file.staged ? 1 : 0.75,
        transition: 'background 0.3s ease, opacity 0.3s ease',
        minWidth: 120,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: STATUS_COLORS[file.status],
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: '#c0c0e0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 140,
          }}
        >
          {fileName}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#6b6b8a', marginTop: 3 }}>
        <span style={{ color: '#4ec94e' }}>+{file.linesAdded}</span>{' '}
        <span style={{ color: '#e05c5c' }}>-{file.linesRemoved}</span>
      </div>
    </div>
  );
});

FileNode.displayName = 'FileNode';
