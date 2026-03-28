import type { FileChange, WorktreeState } from '../types';

export interface FileSections {
  committed: FileChange[];
  staged: FileChange[];
  unstaged: FileChange[];
}

function sortFiles(files: FileChange[]): FileChange[] {
  return [...files].sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    return a.path.localeCompare(b.path);
  });
}

/**
 * Partitions a worktree's files into Committed / Staged / Unstaged sections.
 * - Branch diff mode  → everything goes into "committed" (static snapshot)
 * - Working mode      → split by file.staged
 */
export function partitionFiles(wt: WorktreeState): FileSections {
  if (wt.diffMode.type === 'branch') {
    return { committed: sortFiles(wt.files), staged: [], unstaged: [] };
  }
  return {
    committed: [],
    staged: sortFiles(wt.files.filter((f) => f.staged)),
    unstaged: sortFiles(wt.files.filter((f) => !f.staged)),
  };
}
