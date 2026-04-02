import { create } from 'zustand';
import type { InsightDetail, InsightFinding, FileDiagnosticSummary } from '../types';
import { storeKey, storeKeyPrefix } from '../utils/storeKeys';

/** Delete all entries in a Map whose key starts with the worktree prefix. */
function deleteByPrefix<V>(map: Map<string, V>, worktreeId: string): boolean {
  const prefix = storeKeyPrefix(worktreeId);
  let changed = false;
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) {
      map.delete(key);
      changed = true;
    }
  }
  return changed;
}

/**
 * Derived index: `${worktreeId}:${filePath}` → InsightFinding[].
 * Rebuilt from insightDetails on every write so lookups are O(1).
 */
type FindingsIndex = Map<string, InsightFinding[]>;

/**
 * Incrementally rebuild findings index for a single worktree.
 * Removes all entries for the given worktree prefix, then re-indexes
 * only insights belonging to that worktree. O(k) where k = entries
 * for the affected worktree, instead of O(n*m) for the full index.
 */
function rebuildFindingsIndexForWorktree(
  prev: FindingsIndex,
  details: Map<string, InsightDetail>,
  worktreeId: string
): FindingsIndex {
  const index: FindingsIndex = new Map(prev);
  const prefix = storeKeyPrefix(worktreeId);
  // Remove stale entries for this worktree
  for (const key of index.keys()) {
    if (key.startsWith(prefix)) index.delete(key);
  }
  // Re-index only this worktree's insights
  for (const [key, detail] of details) {
    if (!key.startsWith(prefix)) continue;
    for (const fi of detail.fileInsights) {
      const indexKey = storeKey(worktreeId, fi.filePath);
      const existing = index.get(indexKey);
      if (existing) {
        existing.push(...fi.findings);
      } else {
        index.set(indexKey, [...fi.findings]);
      }
    }
  }
  return index;
}

interface InsightStore {
  /** Keyed by `${worktreeId}:${insightId}` */
  insightDetails: Map<string, InsightDetail>;
  /** Keyed by `${worktreeId}:${filePath}` — derived index for O(1) lookups. */
  findingsIndex: FindingsIndex;
  /** Keyed by `${worktreeId}:${filePath}` */
  fileDiagnostics: Map<string, FileDiagnosticSummary>;
  setInsightDetail: (worktreeId: string, insightId: string, detail: InsightDetail) => void;
  clearInsightDetails: (worktreeId: string) => void;
  /** Merge/upsert diagnostics — only updates entries for the given files, leaves others untouched. */
  setFileDiagnostics: (worktreeId: string, files: FileDiagnosticSummary[]) => void;
  /** Remove diagnostic entries for specific files (e.g. when files leave the worktree). */
  removeFileDiagnostics: (worktreeId: string, filePaths: string[]) => void;
  clearFileDiagnostics: (worktreeId: string) => void;
}

const EMPTY_FINDINGS: InsightFinding[] = [];

/**
 * Look up InsightFindings for a file. O(1) via the derived index.
 */
export function getFileFindings(
  findingsIndex: FindingsIndex,
  worktreeId: string,
  filePath: string
): InsightFinding[] {
  return findingsIndex.get(storeKey(worktreeId, filePath)) ?? EMPTY_FINDINGS;
}

export const useInsightStore = create<InsightStore>((set) => ({
  insightDetails: new Map(),
  findingsIndex: new Map(),
  fileDiagnostics: new Map(),

  setInsightDetail: (worktreeId, insightId, detail) =>
    set((s) => {
      const insightDetails = new Map<string, InsightDetail>(s.insightDetails);
      insightDetails.set(storeKey(worktreeId, insightId), detail);
      return {
        insightDetails,
        findingsIndex: rebuildFindingsIndexForWorktree(s.findingsIndex, insightDetails, worktreeId),
      };
    }),

  clearInsightDetails: (worktreeId) =>
    set((s) => {
      const insightDetails = new Map<string, InsightDetail>(s.insightDetails);
      const changed = deleteByPrefix(insightDetails, worktreeId);
      if (!changed) return {};
      return {
        insightDetails,
        findingsIndex: rebuildFindingsIndexForWorktree(s.findingsIndex, insightDetails, worktreeId),
      };
    }),

  setFileDiagnostics: (worktreeId, files) =>
    set((s) => {
      if (files.length === 0) return {};
      const fileDiagnostics = new Map<string, FileDiagnosticSummary>(s.fileDiagnostics);
      for (const file of files) {
        fileDiagnostics.set(storeKey(worktreeId, file.filePath), file);
      }
      return { fileDiagnostics };
    }),

  removeFileDiagnostics: (worktreeId, filePaths) =>
    set((s) => {
      if (filePaths.length === 0) return {};
      const fileDiagnostics = new Map<string, FileDiagnosticSummary>(s.fileDiagnostics);
      let changed = false;
      for (const fp of filePaths) {
        changed = fileDiagnostics.delete(storeKey(worktreeId, fp)) || changed;
      }
      return changed ? { fileDiagnostics } : {};
    }),

  clearFileDiagnostics: (worktreeId) =>
    set((s) => {
      const fileDiagnostics = new Map<string, FileDiagnosticSummary>(s.fileDiagnostics);
      const changed = deleteByPrefix(fileDiagnostics, worktreeId);
      return changed ? { fileDiagnostics } : {};
    }),
}));
