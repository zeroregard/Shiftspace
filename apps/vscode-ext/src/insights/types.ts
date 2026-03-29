import type { FileChange } from '@shiftspace/renderer';

export interface InsightConfig {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export type InsightSeverity = 'none' | 'low' | 'medium' | 'high';

export interface InsightSummary {
  insightId: string;
  worktreeId: string;
  score: number;
  label: string;
  severity: InsightSeverity;
}

export interface InsightDetail {
  insightId: string;
  worktreeId: string;
  data: unknown;
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
