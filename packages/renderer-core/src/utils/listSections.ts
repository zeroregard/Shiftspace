import type { FileChange, WorktreeState } from '../types';

interface FileSections {
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
 *
 * A file with `partiallyStaged: true` (e.g. after `git add -p`) appears in
 * **both** Staged and Unstaged — its chunks are split across both sections.
 */
export function partitionFiles(wt: WorktreeState): FileSections {
  return {
    committed: wt.diffMode.type === 'branch' ? sortFiles(wt.branchFiles ?? []) : [],
    staged: sortFiles(wt.files.filter((f) => f.staged || !!f.partiallyStaged)),
    unstaged: sortFiles(wt.files.filter((f) => !f.staged || !!f.partiallyStaged)),
  };
}

/**
 * Returns true if the given file path matches the search query.
 * Tries regex first; falls back to case-insensitive substring if the regex is invalid.
 */
export function matchesFileFilter(filePath: string, filterText: string): boolean {
  if (!filterText) return true;
  try {
    const regex = new RegExp(filterText, 'i');
    return regex.test(filePath);
  } catch {
    return filePath.toLowerCase().includes(filterText.toLowerCase());
  }
}

/**
 * Returns true if the search query is a valid regular expression.
 */
export function isValidRegex(query: string): boolean {
  if (!query) return true;
  try {
    new RegExp(query, 'i');
    return true;
  } catch {
    return false;
  }
}

/**
 * Filters an array of files by a search query.
 * Uses regex matching if query is valid regex, otherwise case-insensitive substring.
 */
export function filterFilesByQuery(files: FileChange[], query: string): FileChange[] {
  if (!query) return files;
  return files.filter((f) => matchesFileFilter(f.path, query));
}

/**
 * Combines all file sections from a worktree into a single flat array,
 * then filters by search query. Used by the Hierarchy panel to match the List panel.
 */
export function getAllFilteredFiles(wt: WorktreeState, query: string): FileChange[] {
  const { committed, staged, unstaged } = partitionFiles(wt);
  const all = [...committed, ...staged, ...unstaged];
  return filterFilesByQuery(all, query);
}
