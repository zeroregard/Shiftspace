import type { FileChange, InsightFinding, FileInsight, InsightDetail } from '@shiftspace/renderer';

export type { InsightFinding, FileInsight, InsightDetail };

export interface InsightSummary {
  insightId: string;
  worktreeId: string;
  score: number;
  label: string;
  severity: 'none' | 'low' | 'medium' | 'high';
}

export interface InsightPlugin {
  id: string;
  label: string;
  icon: string;
  defaultSettings: Record<string, unknown>;

  analyze(
    files: FileChange[],
    repoRoot: string,
    worktreeRoot: string,
    settings: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<{ summary: InsightSummary; detail: InsightDetail }>;
}
