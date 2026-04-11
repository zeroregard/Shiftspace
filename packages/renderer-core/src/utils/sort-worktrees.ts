import type { WorktreeState, WorktreeSortMode } from '../types';

function worktreeName(wt: WorktreeState): string {
  return (wt.path.split('/').filter(Boolean).pop() ?? wt.path).toLowerCase();
}

function latestTimestamp(wt: WorktreeState): number {
  let max = 0;
  for (const f of wt.files) {
    if (f.lastChangedAt > max) max = f.lastChangedAt;
  }
  if (wt.branchFiles) {
    for (const f of wt.branchFiles) {
      if (f.lastChangedAt > max) max = f.lastChangedAt;
    }
  }
  return max;
}

export function sortWorktrees(worktrees: WorktreeState[], mode: WorktreeSortMode): WorktreeState[] {
  return [...worktrees].sort((a, b) => {
    // Main worktree always first
    if (a.isMainWorktree && !b.isMainWorktree) return -1;
    if (!a.isMainWorktree && b.isMainWorktree) return 1;

    switch (mode) {
      case 'last-updated': {
        const tsA = latestTimestamp(a);
        const tsB = latestTimestamp(b);
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
