import type { WorktreeState, ShiftspaceEvent } from '../types';

/**
 * Pure reducer that applies a ShiftspaceEvent to the worktree map.
 * Extracted from the store to keep each function under the line limit.
 */
export function applyEventReducer(
  worktrees: Map<string, WorktreeState>,
  event: ShiftspaceEvent
): Map<string, WorktreeState> {
  const next = new Map(worktrees);

  switch (event.type) {
    case 'worktree-added': {
      next.set(event.worktree.id, event.worktree);
      break;
    }
    case 'worktree-removed': {
      next.delete(event.worktreeId);
      break;
    }
    case 'file-changed': {
      const wt = next.get(event.worktreeId);
      if (wt) {
        const files = wt.files.filter((f) => f.path !== event.file.path);
        next.set(event.worktreeId, { ...wt, files: [...files, event.file] });
      }
      break;
    }
    case 'file-removed': {
      const wt = next.get(event.worktreeId);
      if (wt) {
        const files = wt.files.filter((f) => f.path !== event.filePath);
        next.set(event.worktreeId, { ...wt, files });
      }
      break;
    }
    case 'file-staged': {
      const wt = next.get(event.worktreeId);
      if (wt) {
        const files = wt.files.map((f) => (f.path === event.filePath ? { ...f, staged: true } : f));
        next.set(event.worktreeId, { ...wt, files });
      }
      break;
    }
    case 'process-started': {
      const wt = next.get(event.worktreeId);
      if (wt) {
        next.set(event.worktreeId, {
          ...wt,
          process: { port: event.port, command: event.command },
        });
      }
      break;
    }
    case 'process-stopped': {
      const wt = next.get(event.worktreeId);
      if (wt) {
        const { process: _removed, ...rest } = wt;
        next.set(event.worktreeId, rest);
      }
      break;
    }
  }

  return next;
}
