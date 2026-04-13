import type { WorktreeState, WorktreeSortMode } from '../types';

function worktreeName(wt: WorktreeState): string {
  return (wt.path.split('/').filter(Boolean).pop() ?? wt.path).toLowerCase();
}

export function sortWorktrees(worktrees: WorktreeState[], mode: WorktreeSortMode): WorktreeState[] {
  return [...worktrees].sort((a, b) => {
    // Main worktree always first
    if (a.isMainWorktree && !b.isMainWorktree) return -1;
    if (!a.isMainWorktree && b.isMainWorktree) return 1;

    switch (mode) {
      case 'last-updated': {
        const tsA = a.lastActivityAt;
        const tsB = b.lastActivityAt;
        // Most recent first; fall back to name if equal
        if (tsA !== tsB) return tsB - tsA;
        return worktreeName(a).localeCompare(worktreeName(b));
      }
      case 'branch':
        return a.branch.toLowerCase().localeCompare(b.branch.toLowerCase());
      case 'name':
      default:
        return worktreeName(a).localeCompare(worktreeName(b));
    }
  });
}
