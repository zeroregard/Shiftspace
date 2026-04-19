import { create } from 'zustand';
import type { InsightDetail, InsightFinding, FileDiagnosticSummary } from '../types';
import { storeKey, storeKeyPrefix } from '../utils/store-keys';

/**
 * Shallow-compare two FileDiagnosticSummary objects by their aggregate counts
 * and detail entries.  Returns true when the data is equivalent so we can
 * skip the store update and preserve the old object reference — preventing
 * downstream selectors / React.memo from seeing a spurious change.
 */
function diagnosticsEqual(a: FileDiagnosticSummary, b: FileDiagnosticSummary): boolean {
  if (
    a.errors !== b.errors ||
    a.warnings !== b.warnings ||
    a.info !== b.info ||
    a.hints !== b.hints ||
    a.details.length !== b.details.length
  ) {
    return false;
  }
  for (let i = 0; i < a.details.length; i++) {
    const da = a.details[i];
    const db = b.details[i];
    if (
      da.severity !== db.severity ||
      da.line !== db.line ||
      da.source !== db.source ||
      da.message !== db.message
    ) {
      return false;
    }
  }
  return true;
}

/** Shallow-compare two InsightFinding arrays by element identity + scalar fields. */
function findingsArrayEqual(a: InsightFinding[], b: InsightFinding[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const fa = a[i];
    const fb = b[i];
    if (fa === fb) continue;
    if (
      fa.ruleId !== fb.ruleId ||
      fa.count !== fb.count ||
      fa.threshold !== fb.threshold ||
      fa.hint !== fb.hint
    ) {
      return false;
    }
  }
  return true;
}

/** Compare two InsightDetail objects by their file-level findings. */
function insightDetailEqual(a: InsightDetail, b: InsightDetail): boolean {
  if (a.fileInsights.length !== b.fileInsights.length) return false;
  for (let i = 0; i < a.fileInsights.length; i++) {
    const fa = a.fileInsights[i];
    const fb = b.fileInsights[i];
    if (fa.filePath !== fb.filePath) return false;
    if (!findingsArrayEqual(fa.findings, fb.findings)) return false;
  }
  return true;
}

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
  // Build the new entries for this worktree into a temporary map first
  const newEntries = new Map<string, InsightFinding[]>();
  const prefix = storeKeyPrefix(worktreeId);

  for (const [key, detail] of details) {
    if (!key.startsWith(prefix)) continue;
    for (const fi of detail.fileInsights) {
      const indexKey = storeKey(worktreeId, fi.filePath);
      const existing = newEntries.get(indexKey);
      if (existing) {
        existing.push(...fi.findings);
      } else {
        newEntries.set(indexKey, [...fi.findings]);
      }
    }
  }

  // Now merge: reuse old array references when content hasn't changed
  // to prevent downstream selectors / React.memo from seeing spurious changes.
  const index: FindingsIndex = new Map(prev);

  // Remove stale entries for this worktree that are no longer present
  for (const key of index.keys()) {
    if (key.startsWith(prefix) && !newEntries.has(key)) {
      index.delete(key);
    }
  }

  // Upsert new entries, reusing old references when data is identical
  for (const [key, newFindings] of newEntries) {
    const oldFindings = index.get(key);
    if (oldFindings && findingsArrayEqual(oldFindings, newFindings)) continue;
    index.set(key, newFindings);
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
      const key = storeKey(worktreeId, insightId);
      const existing = s.insightDetails.get(key);
      // Skip update when the insight data is structurally identical
      if (existing && insightDetailEqual(existing, detail)) return {};
      const insightDetails = new Map<string, InsightDetail>(s.insightDetails);
      insightDetails.set(key, detail);
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
      let changed = false;
      const fileDiagnostics = new Map<string, FileDiagnosticSummary>(s.fileDiagnostics);
      for (const file of files) {
        const key = storeKey(worktreeId, file.filePath);
        const existing = fileDiagnostics.get(key);
        // Skip update when the data is identical — avoids new object references
        // that would trigger unnecessary React re-renders downstream.
        if (existing && diagnosticsEqual(existing, file)) continue;
        fileDiagnostics.set(key, file);
        changed = true;
      }
      return changed ? { fileDiagnostics } : {};
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
