import { useEffect, useMemo } from 'react';
import type { FileChange, FileDiagnosticSummary, InsightFinding, WorktreeState } from '../types';
import {
  fileHasProblems,
  filterFilesByProblems,
  filterFilesByQuery,
  partitionFiles,
} from '../utils/list-sections';

interface UseFilteredFilesOptions {
  wt: WorktreeState;
  searchQuery: string;
  problemsOnly: boolean;
  onProblemsOnlyChange: (value: boolean) => void;
  findingsIndex: Map<string, InsightFinding[]>;
  fileDiagnostics: Map<string, FileDiagnosticSummary>;
}

interface FilteredFiles {
  committed: FileChange[];
  staged: FileChange[];
  unstaged: FileChange[];
  totalFileCount: number;
  filteredFileCount: number;
  hasAnyProblems: boolean;
}

/**
 * Partitions a worktree's files into committed/staged/unstaged sections,
 * applies the search query + problems-only filter, and returns counts +
 * a flag indicating whether any file has problems.
 *
 * Auto-toggles `problemsOnly` off when no files have problems, so the UI
 * doesn't end up in a "filtered to nothing" state after annotations clear.
 */
export function useFilteredFiles({
  wt,
  searchQuery,
  problemsOnly,
  onProblemsOnlyChange,
  findingsIndex,
  fileDiagnostics,
}: UseFilteredFilesOptions): FilteredFiles {
  const sections = useMemo(() => partitionFiles(wt), [wt]);
  const { committed, staged, unstaged } = sections;

  const hasAnyProblems = useMemo(() => {
    const allFiles = [...committed, ...staged, ...unstaged];
    return allFiles.some((f) => fileHasProblems(wt.id, f.path, findingsIndex, fileDiagnostics));
  }, [committed, staged, unstaged, wt.id, findingsIndex, fileDiagnostics]);

  useEffect(() => {
    if (!hasAnyProblems && problemsOnly) onProblemsOnlyChange(false);
  }, [hasAnyProblems, problemsOnly, onProblemsOnlyChange]);

  const filteredCommitted = useMemo(() => {
    let files = filterFilesByQuery(committed, searchQuery);
    if (problemsOnly) files = filterFilesByProblems(files, wt.id, findingsIndex, fileDiagnostics);
    return files;
  }, [committed, searchQuery, problemsOnly, wt.id, findingsIndex, fileDiagnostics]);

  const filteredStaged = useMemo(() => {
    let files = filterFilesByQuery(staged, searchQuery);
    if (problemsOnly) files = filterFilesByProblems(files, wt.id, findingsIndex, fileDiagnostics);
    return files;
  }, [staged, searchQuery, problemsOnly, wt.id, findingsIndex, fileDiagnostics]);

  const filteredUnstaged = useMemo(() => {
    let files = filterFilesByQuery(unstaged, searchQuery);
    if (problemsOnly) files = filterFilesByProblems(files, wt.id, findingsIndex, fileDiagnostics);
    return files;
  }, [unstaged, searchQuery, problemsOnly, wt.id, findingsIndex, fileDiagnostics]);

  const totalFileCount = committed.length + staged.length + unstaged.length;
  const filteredFileCount =
    filteredCommitted.length + filteredStaged.length + filteredUnstaged.length;

  return {
    committed: filteredCommitted,
    staged: filteredStaged,
    unstaged: filteredUnstaged,
    totalFileCount,
    filteredFileCount,
    hasAnyProblems,
  };
}
