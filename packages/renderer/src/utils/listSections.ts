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
 * - Branch diff mode  → branchFiles → Committed; files → Staged/Unstaged
 * - Working mode      → files → Staged/Unstaged only (no Committed)
 */
export function partitionFiles(wt: WorktreeState): FileSections {
  return {
    committed: wt.diffMode.type === 'branch' ? sortFiles(wt.branchFiles ?? []) : [],
    staged: sortFiles(wt.files.filter((f) => f.staged)),
    unstaged: sortFiles(wt.files.filter((f) => !f.staged)),
  };
}
