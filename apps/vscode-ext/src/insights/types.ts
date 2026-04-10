/**
 * INSIGHT ROADMAP — Future plugins to build:
 *
 * 1. Duplication Detection (cross-file, on-demand)
 *    - Detect copy-paste blocks between changed files
 *    - Only runs on button click (expensive, not automatic)
 *    - Uses token-level n-gram hashing or SimHash
 *    - Shows a force-directed graph of file similarity
 *
 * 2. File Complexity (per-file)
 *    - Lines in file, nesting depth, number of functions/exports
 *    - Flags files that exceed a complexity threshold
 *    - Shown as a per-file badge in Inspection
 *
 * 3. Changeset Complexity (per-worktree)
 *    - How many files changed, how spread across folders, total lines
 *    - A single "risk score" for the whole changeset
 *    - Shown on Grove cards
 *
 * 4. Blast Radius (per-file, on-demand)
 *    - Scans the repo for files that IMPORT the changed files
 *    - Answers: "what else could this change break?"
 *    - Requires parsing import statements in unchanged files
 *    - Results cached, invalidated on file changes
 *
 * 5. Consistency Check (per-file, for new files only)
 *    - Looks at existing files in the same folder
 *    - Detects naming convention (camelCase, PascalCase, kebab-case, etc.)
 *    - Flags new files that don't match the sibling pattern
 *    - Pure filename analysis, no content reading
 */

import type { FileChange, InsightFinding, FileInsight, InsightDetail } from '@shiftspace/renderer';

export type { InsightFinding, FileInsight, InsightDetail };

export interface InsightSummary {
  insightId: string;
  worktreeId: string;
  score: number;
  label: string;
  severity: 'none' | 'low' | 'medium' | 'high';
}

export interface AnalyzeContext {
  files: FileChange[];
  repoRoot: string;
  worktreeRoot: string;
  settings: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface InsightPlugin {
  id: string;
  label: string;
  icon: string;
  defaultSettings: Record<string, unknown>;

  analyze(ctx: AnalyzeContext): Promise<{ summary: InsightSummary; detail: InsightDetail }>;
}
