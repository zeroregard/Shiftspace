import { describe, it, expect, vi } from 'vitest';
import type { FileChange, ShiftspaceEvent } from '@shiftspace/renderer';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { buildFileChanges } from '../../src/git/status';
import { diffFileChanges } from '../../src/git/eventDiff';

function makeFile(overrides: Partial<FileChange> & { path: string }): FileChange {
  return {
    status: 'modified',
    staged: false,
    linesAdded: 5,
    linesRemoved: 2,
    lastChangedAt: 1_700_000_000_000,
    ...overrides,
  };
}

const WT = 'wt-0';

// ---------------------------------------------------------------------------
// Full flow: git output → FileChange[] → surgical events
// ---------------------------------------------------------------------------
describe('Full flow: initial load → file change → surgical events', () => {
  it('initial state: all files produce file-changed events vs empty previous', () => {
    const initial = buildFileChanges(
      ' M src/app/page.tsx\n?? src/new.ts\n',
      '12\t4\tsrc/app/page.tsx\n',
      ''
    );
    const events = diffFileChanges(WT, [], initial);
    expect(events.every((e) => e.type === 'file-changed')).toBe(true);
    expect(events).toHaveLength(2);
  });

  it('file change: linesAdded update produces file-changed event', () => {
    const prev = [makeFile({ path: 'src/app/page.tsx', linesAdded: 5 })];
    const curr = buildFileChanges(' M src/app/page.tsx\n', '20\t4\tsrc/app/page.tsx\n', '');
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('file-changed');
  });

  it('file committed: file disappears from status → file-removed event', () => {
    const prev = [makeFile({ path: 'src/app/page.tsx' }), makeFile({ path: 'src/committed.ts' })];
    // Only page.tsx remains
    const curr = buildFileChanges(' M src/app/page.tsx\n', '', '');
    const events = diffFileChanges(WT, prev, curr);
    expect(events.some((e) => e.type === 'file-removed')).toBe(true);
    const removed = events.find(
      (e): e is Extract<ShiftspaceEvent, { type: 'file-removed' }> => e.type === 'file-removed'
    )!;
    expect(removed.filePath).toBe('src/committed.ts');
  });

  it('staging a file: staged flag changes → file-changed event', () => {
    const prev = [makeFile({ path: 'src/app/page.tsx', staged: false })];
    // After git add, staged becomes true
    const curr = buildFileChanges('M  src/app/page.tsx\n', '', '5\t2\tsrc/app/page.tsx\n');
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    const changed = events[0] as Extract<ShiftspaceEvent, { type: 'file-changed' }>;
    expect(changed.type).toBe('file-changed');
    expect(changed.file.staged).toBe(true);
  });

  it('new worktree: starts with empty prev → all files emit file-changed', () => {
    const curr = [
      makeFile({ path: 'src/a.ts', status: 'added' }),
      makeFile({ path: 'src/b.ts', status: 'modified' }),
    ];
    const events = diffFileChanges(WT, [], curr);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === 'file-changed')).toBe(true);
  });

  it('no actual change: identical file lists produce no events', () => {
    const files = [
      makeFile({ path: 'src/a.ts' }),
      makeFile({ path: 'src/b.ts', staged: true, linesAdded: 10 }),
    ];
    // Deep-clone to simulate re-querying git
    const same = files.map((f) => ({ ...f }));
    const events = diffFileChanges(WT, files, same);
    expect(events).toHaveLength(0);
  });

  it('multiple files change simultaneously: correct events for each', () => {
    const prev = [
      makeFile({ path: 'src/a.ts', linesAdded: 5 }),
      makeFile({ path: 'src/b.ts', staged: false }),
      makeFile({ path: 'src/c.ts' }),
    ];
    const curr = [
      makeFile({ path: 'src/a.ts', linesAdded: 20 }), // lines changed
      makeFile({ path: 'src/b.ts', staged: true }), // staged
      // c.ts gone (committed)
      makeFile({ path: 'src/d.ts', status: 'added' }), // new file
    ];
    const events = diffFileChanges(WT, prev, curr);
    const changed = events.filter((e) => e.type === 'file-changed');
    const removed = events.filter((e) => e.type === 'file-removed');
    expect(changed).toHaveLength(3); // a, b, d
    expect(removed).toHaveLength(1); // c
  });
});

describe('Event diffing edge cases', () => {
  it('handles files with spaces in paths', () => {
    const prev: FileChange[] = [];
    const curr = [makeFile({ path: 'src/my file.ts', status: 'added' })];
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('file-changed');
  });

  it('handles deeply nested paths', () => {
    const prev: FileChange[] = [];
    const curr = [makeFile({ path: 'src/app/auth/login/components/Form.tsx', status: 'added' })];
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(1);
  });

  it('handles large number of files without errors', () => {
    const prev: FileChange[] = [];
    const curr = Array.from({ length: 100 }, (_, i) =>
      makeFile({ path: `src/file-${i}.ts`, status: 'added' })
    );
    const events = diffFileChanges(WT, prev, curr);
    expect(events).toHaveLength(100);
  });
});
