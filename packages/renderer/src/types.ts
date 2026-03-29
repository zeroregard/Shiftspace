export type DiffMode =
  | { type: 'working' } // current behavior: unstaged + staged changes
  | { type: 'branch'; branch: string }; // diff HEAD against another branch

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
  | { type: 'process-started'; worktreeId: string; port: number; command: string }
  | { type: 'process-stopped'; worktreeId: string };

export type LODLevel = 'worktree' | 'directory' | 'file';

export type AppMode = { type: 'grove' } | { type: 'inspection'; worktreeId: string };

// ---------------------------------------------------------------------------
// Action buttons
// ---------------------------------------------------------------------------

export interface ActionConfig {
  id: string;
  label: string;
  /** Codicon name, e.g. 'play', 'package', 'tools' */
  icon: string;
  /** True for long-running processes (dev server), false for one-shot (build/test) */
  persistent: boolean;
}

export type ActionStatus = 'idle' | 'running' | 'failed';

export interface ActionState {
  status: ActionStatus;
  port?: number;
}

// ---------------------------------------------------------------------------
// File icon theme (populated by the VSCode extension host, not the preview app)
// ---------------------------------------------------------------------------

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
