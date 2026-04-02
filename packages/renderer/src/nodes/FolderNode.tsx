import type { NodeComponentProps } from '../TreeCanvas';
import { FolderIcon } from '@shiftspace/ui/file-icons';
import type { FolderNodeData } from '../layout/flatten';
import { useActions } from '../ui/ActionsContext';

export function FolderNode({ data }: NodeComponentProps<FolderNodeData>) {
  const actions = useActions();

  return (
    <div
      className="w-full h-full border border-border-default rounded-md bg-node-folder flex items-center gap-1 px-2 text-left cursor-pointer hover:bg-node-file transition-colors"
      onClick={() => actions.folderClick(data.worktreeId, data.folderPath)}
    >
      <span className="shrink-0 flex items-center text-text-secondary">
        <FolderIcon name={data.name} size={14} />
      </span>
      <span className="text-11 text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
        {data.name}
      </span>
    </div>
  );
}
