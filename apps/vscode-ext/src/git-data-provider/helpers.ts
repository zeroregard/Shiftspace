import * as vscode from 'vscode';
import * as path from 'path';
import type { WorktreeState, DiffMode, FileChange } from '@shiftspace/renderer';

/**
 * Copy `lastChangedAt` from `prev` onto unchanged files in `next` so the
 * timestamp reflects the last real change rather than the last poll tick.
 * Files whose tracked fields (status/staged/linesAdded/linesRemoved) match
 * are considered unchanged; changed or new files keep their fresh timestamp.
 */
export function preserveLastChangedAt(prev: FileChange[], next: FileChange[]): FileChange[] {
  if (prev.length === 0) return next;
  const prevMap = new Map(prev.map((f) => [f.path, f]));
  return next.map((f) => {
    const p = prevMap.get(f.path);
    if (
      p &&
      p.status === f.status &&
      p.staged === f.staged &&
      p.linesAdded === f.linesAdded &&
      p.linesRemoved === f.linesRemoved
    ) {
      return { ...f, lastChangedAt: p.lastChangedAt };
    }
    return f;
  });
}

export function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

export function getIgnorePatterns(): string[] {
  const config = vscode.workspace.getConfiguration('shiftspace');
  return config.get<string[]>('ignorePatterns', []);
}

const IGNORED_SEGMENTS = ['.git', 'node_modules'];

export function isIgnoredPath(fsPath: string): boolean {
  return IGNORED_SEGMENTS.some((seg) => fsPath.includes(`${path.sep}${seg}${path.sep}`));
}

export function findWorktreeForPath(
  worktrees: WorktreeState[],
  fsPath: string
): WorktreeState | undefined {
  // Find the most-specific (longest-path) worktree that contains the file
  return worktrees
    .filter((wt) => fsPath.startsWith(wt.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
