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
      const prev = worktrees.get(event.oldWorktreeId);
      const next = new Map(worktrees);
      next.delete(event.oldWorktreeId);
      // Renames are not "activity" — preserve the previous lastActivityAt.
      next.set(event.worktree.id, {
        ...event.worktree,
        lastActivityAt: prev?.lastActivityAt ?? event.worktree.lastActivityAt,
      });
      return next;
    }
    case 'worktree-activity': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt) return worktrees;
      if (wt.lastActivityAt >= event.timestamp) return worktrees;
      const next = new Map(worktrees);
      next.set(event.worktreeId, { ...wt, lastActivityAt: event.timestamp });
      return next;
    }
    case 'file-changed': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt) return worktrees;
      const idx = wt.files.findIndex((f) => f.path === event.file.path);
      const prevFile = idx >= 0 ? wt.files[idx] : undefined;
      const files =
        idx >= 0
          ? [...wt.files.slice(0, idx), event.file, ...wt.files.slice(idx + 1)]
          : [...wt.files, event.file];
      // Only content changes (new file, or status/linesAdded/linesRemoved
      // differ) count as activity — a bare `staged` flip does not.
      const contentChanged =
        !prevFile ||
        prevFile.status !== event.file.status ||
        prevFile.linesAdded !== event.file.linesAdded ||
        prevFile.linesRemoved !== event.file.linesRemoved;
      const lastActivityAt = contentChanged
        ? Math.max(wt.lastActivityAt, event.file.lastChangedAt)
        : wt.lastActivityAt;
      const next = new Map(worktrees);
      next.set(event.worktreeId, { ...wt, files, lastActivityAt });
      return next;
    }
    case 'file-removed': {
      const wt = worktrees.get(event.worktreeId);
      if (!wt) return worktrees;
      const files = wt.files.filter((f) => f.path !== event.filePath);
      if (files.length === wt.files.length) return worktrees;
      // Don't bump lastActivityAt: the provider emits `worktree-activity`
      // explicitly when a removal represents a revert (working-tree change).
      // Removals from commits should not register as activity.
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
      // Staging flips the flag but doesn't change file content — not activity.
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
