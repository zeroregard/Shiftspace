import React from 'react';
import clsx from 'clsx';
import type { NodeComponentProps } from '../TreeCanvas';
import type { FileChange } from '../types';
import { STATUS_CLASSES } from '../utils/statusClasses';
import { DiffPopover } from '../overlays/DiffPopover';
import { ThemedFileIcon } from '../shared/ThemedFileIcon';

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
  const isDeleted = file.status === 'deleted';

  return (
    <DiffPopover file={file}>
      <button
        className={clsx(
          'w-full h-full flex items-center gap-1 px-2 py-1.5 text-left bg-transparent transition-[background] duration-300 rounded-md',
          onFileClick ? 'cursor-pointer' : 'cursor-default',
          isPulsing ? 'bg-node-file-pulse' : 'hover:bg-node-file-pulse'
        )}
        onClick={() => onFileClick?.(worktreeId, file.path)}
      >
        <span className="shrink-0 flex items-center">
          <ThemedFileIcon filePath={file.path} size={12} />
        </span>
        <span
          className={clsx(
            'text-11 overflow-hidden text-ellipsis whitespace-nowrap',
            isDeleted ? 'text-status-deleted line-through' : 'text-text-primary'
          )}
        >
          {fileName}
        </span>
        <span
          className={clsx('size-2 rounded-full inline-block shrink-0', STATUS_CLASSES[file.status])}
        />
      </button>
    </DiffPopover>
  );
});

FileNode.displayName = 'FileNode';
