import { describe, it, expect } from 'vitest';
import type { WorktreeState, FileChange, ShiftspaceEvent } from '@shiftspace/renderer';

// ---------------------------------------------------------------------------
// Message protocol serialization tests
// These verify that the data structures used in host↔webview messages
// round-trip through JSON correctly, matching the expected shape.
// ---------------------------------------------------------------------------

function roundtrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const sampleFile: FileChange = {
  path: 'src/app/page.tsx',
  status: 'modified',
  staged: true,
  linesAdded: 12,
  linesRemoved: 4,
  lastChangedAt: 1_700_000_000_000,
};

const sampleWorktree: WorktreeState = {
  id: 'wt-0',
  path: '/home/user/project',
  branch: 'main',
  files: [sampleFile],
  diffMode: { type: 'working' },
  defaultBranch: 'main',
};

describe('init message serialization', () => {
  it('serialises WorktreeState[] correctly', () => {
    const msg = { type: 'init' as const, worktrees: [sampleWorktree] };
    const parsed = roundtrip(msg);
    expect(parsed.type).toBe('init');
    expect(parsed.worktrees).toHaveLength(1);
    const wt = parsed.worktrees[0]!;
    expect(wt.id).toBe('wt-0');
    expect(wt.branch).toBe('main');
    expect(wt.files).toHaveLength(1);
    expect(wt.files[0]!.path).toBe('src/app/page.tsx');
    expect(wt.files[0]!.linesAdded).toBe(12);
  });

  it('preserves worktree with process field', () => {
    const wt: WorktreeState = {
      ...sampleWorktree,
      process: { port: 3001, command: 'pnpm dev' },
    };
    const parsed = roundtrip({ type: 'init', worktrees: [wt] });
    expect(parsed.worktrees[0]!.process?.port).toBe(3001);
  });

  it('preserves worktree without process field', () => {
    const parsed = roundtrip({ type: 'init', worktrees: [sampleWorktree] });
    expect(parsed.worktrees[0]!.process).toBeUndefined();
  });
});

describe('event message serialization', () => {
  it('serialises file-changed event', () => {
    const event: ShiftspaceEvent = {
      type: 'file-changed',
      worktreeId: 'wt-0',
      file: sampleFile,
    };
    const msg = roundtrip({ type: 'event', event });
    expect(msg.event.type).toBe('file-changed');
    expect((msg.event as { file: FileChange }).file.path).toBe('src/app/page.tsx');
  });

  it('serialises file-removed event', () => {
    const event: ShiftspaceEvent = {
      type: 'file-removed',
      worktreeId: 'wt-0',
      filePath: 'src/deleted.ts',
    };
    const msg = roundtrip({ type: 'event', event });
    expect(msg.event.type).toBe('file-removed');
    expect((msg.event as { filePath: string }).filePath).toBe('src/deleted.ts');
  });

  it('serialises worktree-added event', () => {
    const event: ShiftspaceEvent = {
      type: 'worktree-added',
      worktree: sampleWorktree,
    };
    const msg = roundtrip({ type: 'event', event });
    expect(msg.event.type).toBe('worktree-added');
    expect((msg.event as { worktree: WorktreeState }).worktree.branch).toBe('main');
  });

  it('serialises worktree-removed event', () => {
    const event: ShiftspaceEvent = { type: 'worktree-removed', worktreeId: 'wt-1' };
    const msg = roundtrip({ type: 'event', event });
    expect(msg.event.type).toBe('worktree-removed');
    expect((msg.event as { worktreeId: string }).worktreeId).toBe('wt-1');
  });
});

describe('file-click message from webview', () => {
  it('contains correct worktreeId and filePath', () => {
    const msg = { type: 'file-click', worktreeId: 'wt-0', filePath: 'src/app/page.tsx' };
    const parsed = roundtrip(msg);
    expect(parsed.type).toBe('file-click');
    expect(parsed.worktreeId).toBe('wt-0');
    expect(parsed.filePath).toBe('src/app/page.tsx');
  });
});

describe('error message from extension', () => {
  it('contains a message string', () => {
    const msg = { type: 'error', message: 'Git is not available' };
    const parsed = roundtrip(msg);
    expect(parsed.type).toBe('error');
    expect(parsed.message).toBe('Git is not available');
  });
});
