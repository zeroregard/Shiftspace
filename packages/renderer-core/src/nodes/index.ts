export { WorktreeNode } from './worktree-node';
export { FolderNode } from './folder-node';
export { FileNode } from './file-node';

import { WorktreeNode } from './worktree-node';
import { FolderNode } from './folder-node';
import { FileNode } from './file-node';

export const NODE_TYPES: Record<string, React.ComponentType<any>> = {
  worktreeNode: WorktreeNode,
  folderNode: FolderNode,
  fileNode: FileNode,
};
