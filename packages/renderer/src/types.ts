export type DiffMode =
  | { type: 'working' } // current behavior: unstaged + staged changes
  | { type: 'branch'; branch: string }; // diff HEAD against another branch

export interface WorktreeState {
  id: string;
  path: string;
  branch: string;
  files: FileChange[];
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

export type ViewMode = 'tree' | 'slim' | 'list';

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
