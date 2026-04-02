import { create } from 'zustand';
import type { InsightDetail, InsightFinding, FileDiagnosticSummary } from '../types';

/** Delete all entries in a Map whose key starts with `${prefix}:`. */
function deleteByPrefix<V>(map: Map<string, V>, prefix: string): boolean {
  let changed = false;
  for (const key of map.keys()) {
    if (key.startsWith(`${prefix}:`)) {
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

function rebuildFindingsIndex(details: Map<string, InsightDetail>): FindingsIndex {
  const index: FindingsIndex = new Map();
  for (const [key, detail] of details) {
    const worktreeId = key.split(':')[0];
    for (const fi of detail.fileInsights) {
      const indexKey = `${worktreeId}:${fi.filePath}`;
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
  return findingsIndex.get(`${worktreeId}:${filePath}`) ?? EMPTY_FINDINGS;
}

export const useInsightStore = create<InsightStore>((set) => ({
  insightDetails: new Map(),
  findingsIndex: new Map(),
  fileDiagnostics: new Map(),

  setInsightDetail: (worktreeId, insightId, detail) =>
    set((s) => {
      const insightDetails = new Map<string, InsightDetail>(s.insightDetails);
      insightDetails.set(`${worktreeId}:${insightId}`, detail);
      return { insightDetails, findingsIndex: rebuildFindingsIndex(insightDetails) };
    }),

  clearInsightDetails: (worktreeId) =>
    set((s) => {
      const insightDetails = new Map<string, InsightDetail>(s.insightDetails);
      const changed = deleteByPrefix(insightDetails, worktreeId);
      if (!changed) return {};
      return { insightDetails, findingsIndex: rebuildFindingsIndex(insightDetails) };
    }),

  setFileDiagnostics: (worktreeId, files) =>
    set((s) => {
      if (files.length === 0) return {};
      const fileDiagnostics = new Map<string, FileDiagnosticSummary>(s.fileDiagnostics);
      for (const file of files) {
        fileDiagnostics.set(`${worktreeId}:${file.filePath}`, file);
      }
      return { fileDiagnostics };
    }),

  removeFileDiagnostics: (worktreeId, filePaths) =>
    set((s) => {
      if (filePaths.length === 0) return {};
      const fileDiagnostics = new Map<string, FileDiagnosticSummary>(s.fileDiagnostics);
      let changed = false;
      for (const fp of filePaths) {
        changed = fileDiagnostics.delete(`${worktreeId}:${fp}`) || changed;
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
