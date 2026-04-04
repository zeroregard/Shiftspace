export { WorktreeNode } from './WorktreeNode';
export { FolderNode } from './FolderNode';
export { FileNode } from './FileNode';

import { WorktreeNode } from './WorktreeNode';
import { FolderNode } from './FolderNode';
import { FileNode } from './FileNode';

export const NODE_TYPES: Record<string, React.ComponentType<any>> = {
  worktreeNode: WorktreeNode,
  folderNode: FolderNode,
  fileNode: FileNode,
};
