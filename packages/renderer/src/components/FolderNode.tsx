import React from 'react';
import type { NodeComponentProps } from '../TreeCanvas';
import { FolderIcon } from '../icons';
import type { FolderNodeData } from '../layout/flatten';

export const FolderNode = React.memo(({ data }: NodeComponentProps<FolderNodeData>) => (
  <div
    className="w-full h-full border border-border-default rounded-md flex items-center gap-1 px-2 text-left cursor-pointer hover:bg-node-file transition-colors"
    style={{ backgroundColor: data.heatColor ?? 'var(--color-node-folder)' }}
    onClick={() => data.onFolderClick?.(data.worktreeId, data.folderPath)}
  >
    <span className="shrink-0 flex items-center text-text-secondary">
      <FolderIcon name={data.name} size={14} />
    </span>
    <span className="text-11 text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
      {data.name}
    </span>
  </div>
));

FolderNode.displayName = 'FolderNode';
