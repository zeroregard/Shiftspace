import type { FileDiagnosticSummary, InsightDetail } from '@shiftspace/renderer-core/src/types.ts';

export function createFileDiagnostics(
  filePath: string,
  errors: number,
  warnings: number
): FileDiagnosticSummary {
  const details: FileDiagnosticSummary['details'] = [];
  for (let i = 0; i < errors; i++) {
    details.push({
      severity: 'error',
      message: `Error ${i + 1}: Type mismatch in expression`,
      source: 'ts',
      line: 10 + i * 5,
    });
  }
  for (let i = 0; i < warnings; i++) {
    details.push({
      severity: 'warning',
      message: `Warning ${i + 1}: Unused variable`,
      source: 'eslint',
      line: 20 + i * 3,
    });
  }
  return {
    filePath,
    errors,
    warnings,
    info: 0,
    hints: 0,
    details,
  };
}

export function createInsightDetail(
  worktreeId: string,
  insightId: string,
  fileFindings: Array<{
    filePath: string;
    findings: Array<{ ruleId: string; ruleLabel: string; count: number; threshold: number }>;
  }>
): InsightDetail {
  return {
    insightId,
    worktreeId,
    fileInsights: fileFindings.map(({ filePath, findings }) => ({
      filePath,
      findings,
    })),
  };
}
