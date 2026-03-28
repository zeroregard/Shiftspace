import { describe, it, expect, beforeEach } from 'vitest';
import { partitionFiles } from './listSections';
import type { WorktreeState, FileChange } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(
  path: string,
  staged: boolean,
  status: FileChange['status'] = 'modified'
): FileChange {
  return { path, status, staged, linesAdded: 1, linesRemoved: 0, lastChangedAt: 0 };
}

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-test',
    path: '/tmp/repo',
    branch: 'feature/x',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// partitionFiles — working mode
// ---------------------------------------------------------------------------

describe('partitionFiles — working mode', () => {
  it('puts staged files in staged section', () => {
    const wt = makeWt({ files: [makeFile('a.ts', true), makeFile('b.ts', true)] });
    const { staged, unstaged, committed } = partitionFiles(wt);
    expect(staged.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(unstaged).toEqual([]);
    expect(committed).toEqual([]);
  });

  it('puts unstaged files in unstaged section', () => {
    const wt = makeWt({ files: [makeFile('a.ts', false), makeFile('b.ts', false)] });
    const { staged, unstaged, committed } = partitionFiles(wt);
    expect(unstaged.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(staged).toEqual([]);
    expect(committed).toEqual([]);
  });

  it('splits mixed files into correct sections', () => {
    const wt = makeWt({
      files: [
        makeFile('a.ts', true),
        makeFile('b.ts', false),
        makeFile('c.ts', true),
        makeFile('d.ts', false),
      ],
    });
    const { staged, unstaged, committed } = partitionFiles(wt);
    expect(staged.map((f) => f.path)).toEqual(['a.ts', 'c.ts']);
    expect(unstaged.map((f) => f.path)).toEqual(['b.ts', 'd.ts']);
    expect(committed).toEqual([]);
  });

  it('returns empty sections for empty file list', () => {
    const wt = makeWt({ files: [] });
    const result = partitionFiles(wt);
    expect(result).toEqual({ committed: [], staged: [], unstaged: [] });
  });
});

// ---------------------------------------------------------------------------
// partitionFiles — branch mode  (the failing case)
// ---------------------------------------------------------------------------

describe('partitionFiles — branch mode', () => {
  it('puts ALL files in committed section', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      files: [makeFile('a.ts', false), makeFile('b.ts', false), makeFile('c.ts', false)],
    });
    const { committed, staged, unstaged } = partitionFiles(wt);
    expect(committed.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(staged).toEqual([]);
    expect(unstaged).toEqual([]);
  });

  it('treats staged=false files as committed (not unstaged) in branch mode', () => {
    // This is the core bug: branch-diff files come back with staged=false from
    // getMockBranchFiles. Before the fix they landed in "unstaged" instead of "committed".
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      files: [makeFile('src/index.ts', false, 'modified'), makeFile('src/app.ts', false, 'added')],
    });
    const { committed, unstaged } = partitionFiles(wt);
    expect(committed).toHaveLength(2);
    expect(unstaged).toHaveLength(0);
  });

  it('returns empty committed for empty file list in branch mode', () => {
    const wt = makeWt({ diffMode: { type: 'branch', branch: 'main' }, files: [] });
    const result = partitionFiles(wt);
    expect(result).toEqual({ committed: [], staged: [], unstaged: [] });
  });

  it('sorts committed files by status then path', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      files: [
        makeFile('z.ts', false, 'added'),
        makeFile('a.ts', false, 'modified'),
        makeFile('m.ts', false, 'added'),
      ],
    });
    const { committed } = partitionFiles(wt);
    // 'added' < 'modified' alphabetically; within 'added': m.ts < z.ts
    expect(committed.map((f) => f.path)).toEqual(['m.ts', 'z.ts', 'a.ts']);
  });
});

// ---------------------------------------------------------------------------
// Store flow: applyEvent respects diffMode
// ---------------------------------------------------------------------------

describe('store applyEvent — branch mode guard', () => {
  // Import the store fresh for each test to avoid cross-test pollution
  let useShiftspaceStore: typeof import('../store/index').useShiftspaceStore;

  beforeEach(async () => {
    // Re-import to get a clean module (vitest resets modules if configured, otherwise
    // we reset the store state manually via setState)
    const mod = await import('../store/index');
    useShiftspaceStore = mod.useShiftspaceStore;
    // Reset store to initial state
    useShiftspaceStore.setState({
      worktrees: new Map(),
    });
  });

  function seedWorktree(diffMode: WorktreeState['diffMode'], files: FileChange[] = []) {
    const wt: WorktreeState = makeWt({ diffMode, files });
    useShiftspaceStore.getState().setWorktrees([wt]);
    return wt;
  }

  it('applies file-changed in working mode', () => {
    seedWorktree({ type: 'working' });
    useShiftspaceStore.getState().applyEvent({
      type: 'file-changed',
      worktreeId: 'wt-test',
      file: makeFile('new.ts', false),
    });
    const wt = useShiftspaceStore.getState().worktrees.get('wt-test')!;
    expect(wt.files).toHaveLength(1);
    expect(wt.files[0].path).toBe('new.ts');
  });

  it('blocks file-changed in branch mode', () => {
    seedWorktree({ type: 'branch', branch: 'main' });
    useShiftspaceStore.getState().applyEvent({
      type: 'file-changed',
      worktreeId: 'wt-test',
      file: makeFile('new.ts', false),
    });
    const wt = useShiftspaceStore.getState().worktrees.get('wt-test')!;
    expect(wt.files).toHaveLength(0);
  });

  it('updateWorktreeFiles replaces files and sets diffMode', () => {
    // Start in working mode with some agent files
    seedWorktree({ type: 'working' }, [makeFile('agent.ts', false)]);

    const committedFiles = [makeFile('committed.ts', false), makeFile('other.ts', false)];
    useShiftspaceStore
      .getState()
      .updateWorktreeFiles('wt-test', committedFiles, { type: 'branch', branch: 'main' });

    const wt = useShiftspaceStore.getState().worktrees.get('wt-test')!;
    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'main' });
    expect(wt.files).toHaveLength(2);
    expect(wt.files.map((f) => f.path)).toContain('committed.ts');
    expect(wt.files.map((f) => f.path)).not.toContain('agent.ts');
  });

  it('after updateWorktreeFiles with branch mode, partitionFiles puts all files in committed', () => {
    seedWorktree({ type: 'working' }, [makeFile('agent.ts', false)]);

    const committedFiles = [makeFile('committed.ts', false)];
    useShiftspaceStore
      .getState()
      .updateWorktreeFiles('wt-test', committedFiles, { type: 'branch', branch: 'main' });

    const wt = useShiftspaceStore.getState().worktrees.get('wt-test')!;
    const { committed, unstaged } = partitionFiles(wt);
    expect(committed.map((f) => f.path)).toEqual(['committed.ts']);
    expect(unstaged).toHaveLength(0);
  });
});
