import { describe, it, expect } from 'vitest';
import { diffFileChanges } from '../../src/git/event-diff';
import type { FileChange } from '@shiftspace/renderer';

function makeFile(overrides: Partial<FileChange> & { path: string }): FileChange {
  return {
    status: 'modified',
    staged: false,
    linesAdded: 5,
    linesRemoved: 2,
    lastChangedAt: Date.now(),
    ...overrides,
  };
}

const WT = 'wt-0';

describe('diffFileChanges', () => {
  it('emits file-changed for a new file', () => {
    const prev: FileChange[] = [];
    const curr = [makeFile({ path: 'src/new.ts', status: 'added' })];
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'file-changed', worktreeId: WT });
  });

  it('emits file-removed when a file disappears', () => {
    const prev = [makeFile({ path: 'src/gone.ts' })];
    const curr: FileChange[] = [];
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'file-removed',
      worktreeId: WT,
      filePath: 'src/gone.ts',
    });
  });

  it('emits file-changed when staged status changes', () => {
    const prev = [makeFile({ path: 'src/file.ts', staged: false })];
    const curr = [makeFile({ path: 'src/file.ts', staged: true })];
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'file-changed', worktreeId: WT });
  });

  it('emits file-changed when line counts change', () => {
    const prev = [makeFile({ path: 'src/file.ts', linesAdded: 5 })];
    const curr = [makeFile({ path: 'src/file.ts', linesAdded: 10 })];
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('file-changed');
  });

  it('emits file-changed when status changes (e.g. modified → deleted)', () => {
    const prev = [makeFile({ path: 'src/file.ts', status: 'modified' })];
    const curr = [makeFile({ path: 'src/file.ts', status: 'deleted' })];
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('file-changed');
  });

  it('emits no events when nothing changed', () => {
    const file = makeFile({ path: 'src/file.ts' });
    // Same reference values — no change
    const events = diffFileChanges(WT, [file], [{ ...file }]);
    expect(events).toHaveLength(0);
  });

  it('handles multiple simultaneous changes correctly', () => {
    const prev = [
      makeFile({ path: 'src/a.ts' }),
      makeFile({ path: 'src/b.ts' }),
      makeFile({ path: 'src/c.ts' }),
    ];
    const curr = [
      makeFile({ path: 'src/a.ts', linesAdded: 99 }), // changed
      makeFile({ path: 'src/b.ts' }), // unchanged
      makeFile({ path: 'src/d.ts', status: 'added' }), // new
      // src/c.ts removed
    ];
    const events = diffFileChanges(WT, prev, curr);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'file-changed')).toHaveLength(2); // a + d
    expect(types.filter((t) => t === 'file-removed')).toHaveLength(1); // c
  });

  it('returns empty array when both prev and curr are empty', () => {
    expect(diffFileChanges(WT, [], [])).toEqual([]);
  });

  it('uses the correct worktreeId in every event', () => {
    const prev: FileChange[] = [];
    const curr = [makeFile({ path: 'src/a.ts' }), makeFile({ path: 'src/b.ts' })];
    const events = diffFileChanges('wt-special', prev, curr);
    for (const event of events) {
      expect(event.worktreeId).toBe('wt-special');
    }
  });
});
