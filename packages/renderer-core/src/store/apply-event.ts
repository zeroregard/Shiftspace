import type { WorktreeState, ShiftspaceEvent } from '../types';

/**
 * Pure reducer that applies a ShiftspaceEvent to the worktree map.
 * Extracted from the store to keep each function under the line limit.
 */
export function applyEventReducer(
  worktrees: Map<string, WorktreeState>,
  event: ShiftspaceEvent
): Map<string, WorktreeState> {
  switch (event.type) {
    case 'worktree-added': {
      const next = new Map(worktrees);
      next.set(event.worktree.id, event.worktree);
      return next;
    }
    case 'worktree-removed': {
      if (!worktrees.has(event.worktreeId)) return worktrees;
      const next = new Map(worktrees);
      next.delete(event.worktreeId);
      return next;
    }
    case 'worktree-renamed': {
      const next = new Map(worktrees);
      next.delete(event.oldWorktreeId);
      next.set(event.worktree.id, event.worktree);
      return next;
    }
    case 'file-changed': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt) return worktrees;
      const idx = wt.files.findIndex((f) => f.path === event.file.path);
      const files =
        idx >= 0
          ? [...wt.files.slice(0, idx), event.file, ...wt.files.slice(idx + 1)]
          : [...wt.files, event.file];
      const next = new Map(worktrees);
      next.set(event.worktreeId, { ...wt, files });
      return next;
    }
    case 'file-removed': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt) return worktrees;
      const files = wt.files.filter((f) => f.path !== event.filePath);
      if (files.length === wt.files.length) return worktrees;
      const next = new Map(worktrees);
      next.set(event.worktreeId, { ...wt, files });
      return next;
    }
    case 'file-staged': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt) return worktrees;
      const target = wt.files.find((f) => f.path === event.filePath);
      if (!target || target.staged) return worktrees;
      const files = wt.files.map((f) => (f.path === event.filePath ? { ...f, staged: true } : f));
      const next = new Map(worktrees);
      next.set(event.worktreeId, { ...wt, files });
      return next;
    }
    case 'process-started': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt) return worktrees;
      const next = new Map(worktrees);
      next.set(event.worktreeId, {
        ...wt,
        process: { port: event.port, command: event.command },
      });
      return next;
    }
    case 'process-stopped': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt || !wt.process) return worktrees;
      const next = new Map(worktrees);
      const { process: _removed, ...rest } = wt;
      next.set(event.worktreeId, rest);
      return next;
    }
    default:
      return worktrees;
  }
}
