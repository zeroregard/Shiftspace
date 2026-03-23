import React from 'react';
import type { NodeComponentProps } from '../TreeCanvas';
import { FolderIcon } from '../icons';

export interface FolderNodeData {
  name: string;
  [key: string]: unknown;
}

export const FolderNode = React.memo(({ data }: NodeComponentProps<FolderNodeData>) => (
  <div className="w-full h-full border border-dashed border-border-dashed rounded-md bg-node-folder text-text-dim opacity-85 flex items-center gap-1 px-2 text-left">
    <span className="shrink-0 flex items-center">
      <FolderIcon name={data.name} size={14} />
    </span>
    <span className="text-11 text-text-dim overflow-hidden text-ellipsis whitespace-nowrap">
      {data.name}
    </span>
  </div>
));

FolderNode.displayName = 'FolderNode';
