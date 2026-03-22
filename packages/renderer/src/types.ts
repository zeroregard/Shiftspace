export interface WorktreeState {
  id: string;
  path: string;
  branch: string;
  files: FileChange[];
  process?: { port: number; command: string };
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
}

export type ShiftspaceEvent =
  | { type: 'file-changed'; worktreeId: string; file: FileChange }
  | { type: 'file-staged'; worktreeId: string; filePath: string }
  | { type: 'worktree-added'; worktree: WorktreeState }
  | { type: 'worktree-removed'; worktreeId: string }
  | { type: 'process-started'; worktreeId: string; port: number; command: string }
  | { type: 'process-stopped'; worktreeId: string };

export type LODLevel = 'worktree' | 'directory' | 'file';
