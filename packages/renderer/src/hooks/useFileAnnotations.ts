import { useShallow } from 'zustand/react/shallow';
import { useInsightStore, getFileFindings } from '../store';
import type { FileDiagnosticSummary, InsightFinding } from '../types';

export interface FileAnnotations {
  errors: number;
  warnings: number;
  findings: InsightFinding[];
  totalFindings: number;
  diagnostics: FileDiagnosticSummary | undefined;
  hasAnnotations: boolean;
}

/**
 * Shared hook that fetches diagnostic + insight annotation data for a file.
 * Used by FileNode and InspectionFileRow to avoid duplicating
 * the same Zustand selector pattern.
 */
export function useFileAnnotations(worktreeId: string, filePath: string): FileAnnotations {
  const findings = useInsightStore(
    useShallow((s) => getFileFindings(s.findingsIndex, worktreeId, filePath))
  );

  const diagnostics = useInsightStore((s) => s.fileDiagnostics.get(`${worktreeId}:${filePath}`));

  const errors = diagnostics?.errors ?? 0;
  const warnings = diagnostics?.warnings ?? 0;
  const totalFindings = findings.length;
  const hasAnnotations = errors > 0 || warnings > 0 || totalFindings > 0;

  return { errors, warnings, findings, totalFindings, diagnostics, hasAnnotations };
}
