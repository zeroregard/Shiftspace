import type { FileChange, ShiftspaceEvent } from '@shiftspace/renderer';

/**
 * Compute the minimal set of ShiftspaceEvents needed to transition
 * `previous` FileChange[] to `current` FileChange[] for a given worktree.
 */
export function diffFileChanges(
  worktreeId: string,
  previous: FileChange[],
  current: FileChange[]
): ShiftspaceEvent[] {
  const events: ShiftspaceEvent[] = [];
  const prevMap = new Map(previous.map((f) => [f.path, f]));
  const currMap = new Map(current.map((f) => [f.path, f]));

  // Files that appeared or changed
  for (const [path, file] of currMap) {
    const prev = prevMap.get(path);
    if (!prev) {
      events.push({ type: 'file-changed', worktreeId, file });
    } else if (
      prev.staged !== file.staged ||
      prev.status !== file.status ||
      prev.linesAdded !== file.linesAdded ||
      prev.linesRemoved !== file.linesRemoved
    ) {
      events.push({ type: 'file-changed', worktreeId, file });
    }
  }

  // Files that disappeared (committed/reverted)
  for (const path of prevMap.keys()) {
    if (!currMap.has(path)) {
      events.push({ type: 'file-removed', worktreeId, filePath: path });
    }
  }

  return events;
}
