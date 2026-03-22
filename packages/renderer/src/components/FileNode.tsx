import React from 'react';
import clsx from 'clsx';
import type { NodeComponentProps } from '../TreeCanvas';
import type { FileChange } from '../types';
import { STATUS_CLASSES } from '../utils/statusClasses';
import { DiffHoverCard } from './DiffOverlay';

export interface FileNodeData {
  file: FileChange;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  worktreeId: string;
  [key: string]: unknown;
}

export const FileNode = React.memo(({ data }: NodeComponentProps<FileNodeData>) => {
  const { file, onFileClick, worktreeId } = data;
  const fileName = file.path.split('/').pop() ?? file.path;
  const isPulsing = Date.now() - file.lastChangedAt < 3000;

  return (
    <DiffHoverCard file={file}>
      <div
        className={clsx(
          'w-full h-full border rounded-md text-text-secondary transition-[background,opacity] duration-300',
          file.staged ? 'border-border-staged opacity-100' : 'border-border-default opacity-75',
          isPulsing ? 'bg-node-file-pulse' : 'bg-node-file'
        )}
      >
        <div
          className={clsx(
            'w-full h-full px-2 py-1.5 text-left transition-[background] duration-300',
            onFileClick ? 'cursor-pointer' : 'cursor-default',
            isPulsing ? 'bg-pulse-overlay' : 'bg-transparent'
          )}
          onClick={() => onFileClick?.(worktreeId, file.path)}
        >
          <div className="flex items-center gap-1">
            <span
              className={clsx(
                'size-2 rounded-full inline-block shrink-0',
                STATUS_CLASSES[file.status]
              )}
            />
            <span className="text-11 text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap max-w-30">
              {fileName}
            </span>
          </div>
          <div className="text-10 text-text-faint mt-px">
            <span className="text-status-added">+{file.linesAdded}</span>{' '}
            <span className="text-status-deleted">-{file.linesRemoved}</span>
          </div>
        </div>
      </div>
    </DiffHoverCard>
  );
});

FileNode.displayName = 'FileNode';
