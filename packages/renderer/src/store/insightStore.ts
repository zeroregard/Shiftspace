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

interface InsightStore {
  /** Keyed by `${worktreeId}:${insightId}` */
  insightDetails: Map<string, InsightDetail>;
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

/**
 * Collect all InsightFindings for a file across all loaded insight plugins.
 */
export function getFileFindings(
  details: Map<string, InsightDetail>,
  worktreeId: string,
  filePath: string
): InsightFinding[] {
  const findings: InsightFinding[] = [];
  for (const [key, detail] of details) {
    if (!key.startsWith(`${worktreeId}:`)) continue;
    const fi = detail.fileInsights.find((f) => f.filePath === filePath);
    if (fi) findings.push(...fi.findings);
  }
  return findings;
}

export const useInsightStore = create<InsightStore>((set) => ({
  insightDetails: new Map(),
  fileDiagnostics: new Map(),

  setInsightDetail: (worktreeId, insightId, detail) =>
    set((s) => {
      const insightDetails = new Map<string, InsightDetail>(s.insightDetails);
      insightDetails.set(`${worktreeId}:${insightId}`, detail);
      return { insightDetails };
    }),

  clearInsightDetails: (worktreeId) =>
    set((s) => {
      const insightDetails = new Map<string, InsightDetail>(s.insightDetails);
      const changed = deleteByPrefix(insightDetails, worktreeId);
      return changed ? { insightDetails } : {};
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
