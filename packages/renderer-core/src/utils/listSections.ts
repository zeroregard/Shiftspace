import type { FileChange, InsightFinding, FileDiagnosticSummary, WorktreeState } from '../types';
import { storeKey } from './storeKeys';

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
 * - Repo mode         → branchFiles → Tracked (all tracked files, no sections)
 *
 * A file with `partiallyStaged: true` (e.g. after `git add -p`) appears in
 * **both** Staged and Unstaged — its chunks are split across both sections.
 */
export function partitionFiles(wt: WorktreeState): FileSections {
  if (wt.diffMode.type === 'repo') {
    return {
      committed: sortFiles(wt.branchFiles ?? []),
      staged: [],
      unstaged: [],
    };
  }
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
 * Returns true if a file has any problems (errors, warnings, or insight findings).
 */
export function fileHasProblems(
  worktreeId: string,
  filePath: string,
  findingsIndex: Map<string, InsightFinding[]>,
  fileDiagnostics: Map<string, FileDiagnosticSummary>
): boolean {
  const key = storeKey(worktreeId, filePath);
  const findings = findingsIndex.get(key);
  if (findings && findings.length > 0) return true;
  const diag = fileDiagnostics.get(key);
  if (diag && (diag.errors > 0 || diag.warnings > 0)) return true;
  return false;
}

/**
 * Filters an array of files to only those with problems (errors, warnings, findings).
 */
export function filterFilesByProblems(
  files: FileChange[],
  worktreeId: string,
  findingsIndex: Map<string, InsightFinding[]>,
  fileDiagnostics: Map<string, FileDiagnosticSummary>
): FileChange[] {
  return files.filter((f) => fileHasProblems(worktreeId, f.path, findingsIndex, fileDiagnostics));
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
