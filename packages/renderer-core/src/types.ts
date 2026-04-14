export type DiffMode =
  | { type: 'working' } // current behavior: unstaged + staged changes
  | { type: 'branch'; branch: string } // diff HEAD against another branch
  | { type: 'repo' }; // all tracked files in the repository

export interface WorktreeBadge {
  /** Codicon name without the `codicon-` prefix (e.g. 'clock', 'eye'). */
  icon: string;
  label: string;
  /** Hex CSS color for the pill background, e.g. '#7f1d1d'. */
  bgColor: string;
  /** Hex CSS color for the icon + text, e.g. '#fecaca'. */
  fgColor: string;
}

export interface WorktreeState {
  id: string;
  path: string;
  branch: string;
  /** Working-tree files: staged + unstaged. Always used for Staged/Unstaged sections. */
  files: FileChange[];
  /**
   * Branch-diff files: changes committed on this branch vs the base branch.
   * Only populated in branch diff mode. Feeds the "Committed" section.
   */
  branchFiles?: FileChange[];
  process?: { port: number; command: string };
  diffMode: DiffMode;
  defaultBranch: string;
  /** True for the main (non-linked) worktree — always the first entry from `git worktree list`. */
  isMainWorktree: boolean;
  /**
   * Timestamp of the most recent activity on this worktree — file change,
   * commit, or branch/ref checkout. Always set (initialized to worktree
   * creation/detection time). Used for the "last updated" display and sort.
   */
  lastActivityAt: number;
  /** Optional badge defined by `.shiftspace-worktree.json` at the worktree root. */
  badge?: WorktreeBadge;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
}

export interface DiffHunk {
  header: string; // e.g. "@@ -12,4 +12,7 @@"
  lines: DiffLine[];
}

export interface FileChange {
  path: string; // relative to worktree root
  status: 'added' | 'modified' | 'deleted';
  staged: boolean;
  /**
   * True when the file has both staged and unstaged chunks (i.e. `git add -p`
   * was used to partially stage it). When set, the file appears in **both**
   * the Staged and Unstaged sections of the Inspector list view.
   */
  partiallyStaged?: boolean;
  committed?: boolean; // true for files from a branch diff (already committed)
  linesAdded: number;
  linesRemoved: number;
  lastChangedAt: number; // timestamp, used for pulse animation
  diff?: DiffHunk[];
  rawDiff?: string; // unified diff string for @pierre/diffs PatchDiff
}

export type ShiftspaceEvent =
  | { type: 'file-changed'; worktreeId: string; file: FileChange }
  | { type: 'file-removed'; worktreeId: string; filePath: string }
  | { type: 'file-staged'; worktreeId: string; filePath: string }
  | { type: 'worktree-added'; worktree: WorktreeState }
  | { type: 'worktree-removed'; worktreeId: string }
  | { type: 'worktree-removal-pending'; worktreeId: string }
  | { type: 'worktree-removal-failed'; worktreeId: string }
  | { type: 'worktree-add-pending' }
  | { type: 'worktree-add-failed' }
  | { type: 'worktree-renamed'; oldWorktreeId: string; worktree: WorktreeState }
  | { type: 'worktree-activity'; worktreeId: string; timestamp: number }
  | { type: 'process-started'; worktreeId: string; port: number; command: string }
  | { type: 'process-stopped'; worktreeId: string };

export type WorktreeSortMode = 'last-updated' | 'name' | 'branch';

export type LODLevel = 'worktree' | 'directory' | 'file';

export type AppMode = { type: 'grove' } | { type: 'inspection'; worktreeId: string };

// Action buttons

export interface ActionConfig {
  id: string;
  label: string;
  /** Codicon name, e.g. 'play', 'package', 'tools' */
  icon: string;
  /** True for long-running processes (dev server), false for one-shot (build/test) */
  persistent: boolean;
  /** Explicit type: 'check' for one-shot, 'service' for persistent. Optional for backward compat. */
  type?: 'check' | 'service';
}

export type ActionStatus =
  | 'idle' // check: not run yet
  | 'running' // both: currently executing
  | 'passed' // check: exited 0
  | 'failed' // both: exited non-zero or service crashed
  | 'stale' // check: was passed/failed but git changed since
  | 'stopped' // service: not running
  | 'unconfigured'; // requires {package} but none selected

export interface ActionState {
  status: ActionStatus;
  port?: number;
  /** For checks: how long the last run took in milliseconds */
  durationMs?: number;
  /** Redundant with config but useful in state */
  type?: 'check' | 'service';
}

export interface PipelineConfig {
  steps: string[];
  stopOnFailure: boolean;
}

/** Log entry for the check log panel */
export interface LogEntry {
  text: string;
  isStderr: boolean;
}

// Insight findings (populated by the VSCode extension host insight runner)

/** A single rule that was triggered for a file. */
export interface InsightFinding {
  ruleId: string;
  ruleLabel: string;
  /** Number of regex matches found in this file. */
  count: number;
  /** Minimum matches to trigger this rule. */
  threshold: number;
  /** 1-indexed line number of the first match (for jump-to-line). */
  firstLine?: number;
  /** Guidance on how to fix this smell. Shown in tooltips and MCP responses. */
  hint?: string;
}

/** All findings for a single file from one insight plugin. */
export interface FileInsight {
  filePath: string;
  findings: InsightFinding[];
}

/** Per-worktree result from one insight plugin. */
export interface InsightDetail {
  insightId: string;
  worktreeId: string;
  fileInsights: FileInsight[];
}

// Diagnostics (populated by the VSCode extension host diagnostic collector)

/** Summary of VSCode diagnostics (compiler errors, lint warnings) for a single file. */
export interface FileDiagnosticSummary {
  filePath: string;
  errors: number;
  warnings: number;
  info: number;
  hints: number;
  /** Detailed breakdown for hover tooltips (capped at 50 per file). */
  details: Array<{
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    source: string; // e.g. 'ts', 'eslint', 'oxlint'
    line: number;
  }>;
}

// File icon theme (populated by the VSCode extension host, not the preview app)

/**
 * Per-file icon entry. `dark` is a base64 SVG data URI for dark themes.
 * `light` is reserved for future light-theme support.
 */
export interface IconEntry {
  dark?: string;
  light?: string;
}

/**
 * Map from a file's relative path (matching `FileChange.path`) to its
 * resolved icon. Populated by the extension host and stored in the renderer's
 * Zustand store. Empty in the preview app — falls back to built-in icons.
 */
export type IconMap = Record<string, IconEntry>;
