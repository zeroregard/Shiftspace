import React from 'react';
import clsx from 'clsx';
import type { FileChange } from '../types';
import { STATUS_CLASSES } from '../utils/statusClasses';

interface Props {
  file: FileChange;
  onClick?: () => void;
}

export const FileNode = React.memo(({ file, onClick }: Props) => {
  const fileName = file.path.split('/').pop() ?? file.path;
  const isPulsing = Date.now() - file.lastChangedAt < 3000;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'border rounded-md px-[10px] py-[6px] min-w-[120px] transition-[background,opacity] duration-300',
        file.staged ? 'border-border-staged opacity-100' : 'border-border-default opacity-75',
        isPulsing ? 'bg-node-file-pulse' : 'bg-node-file',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex items-center gap-[6px]">
        <span className={clsx('w-2 h-2 rounded-full shrink-0', STATUS_CLASSES[file.status])} />
        <span className="text-[12px] text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap max-w-[140px]">
          {fileName}
        </span>
      </div>
      <div className="text-[10px] text-text-faint mt-[3px]">
        <span className="text-status-added">+{file.linesAdded}</span>{' '}
        <span className="text-status-deleted">-{file.linesRemoved}</span>
      </div>
    </div>
  );
});

FileNode.displayName = 'FileNode';
