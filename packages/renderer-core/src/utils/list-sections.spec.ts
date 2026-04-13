import { describe, it, expect, beforeEach } from 'vitest';
import { partitionFiles } from './list-sections';
import type { WorktreeState, FileChange } from '../types';

// Helpers

function makeFile(
  path: string,
  staged: boolean,
  status: FileChange['status'] = 'modified',
  partiallyStaged?: boolean
): FileChange {
  return {
    path,
    status,
    staged,
    partiallyStaged,
    linesAdded: 1,
    linesRemoved: 0,
    lastChangedAt: 0,
  };
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
    lastActivityAt: 0,
    ...overrides,
  };
}

// partitionFiles — working mode

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

// partitionFiles — partial staging (git add -p)

describe('partitionFiles — partial staging', () => {
  it('a partiallyStaged file appears in both staged and unstaged', () => {
    const wt = makeWt({
      files: [makeFile('src/api.ts', true, 'modified', true)],
    });
    const { staged, unstaged, committed } = partitionFiles(wt);
    expect(staged.map((f) => f.path)).toEqual(['src/api.ts']);
    expect(unstaged.map((f) => f.path)).toEqual(['src/api.ts']);
    expect(committed).toEqual([]);
  });

  it('partiallyStaged file appears in both sections regardless of staged flag value', () => {
    // staged:false + partiallyStaged:true should still appear in both sections
    const wt = makeWt({
      files: [makeFile('src/api.ts', false, 'modified', true)],
    });
    const { staged, unstaged } = partitionFiles(wt);
    expect(staged.map((f) => f.path)).toEqual(['src/api.ts']);
    expect(unstaged.map((f) => f.path)).toEqual(['src/api.ts']);
  });

  it('mixes normal staged, normal unstaged, and partially staged files correctly', () => {
    const wt = makeWt({
      files: [
        makeFile('only-staged.ts', true),
        makeFile('only-unstaged.ts', false),
        makeFile('partial.ts', true, 'modified', true),
      ],
    });
    const { staged, unstaged } = partitionFiles(wt);
    expect(staged.map((f) => f.path).sort()).toEqual(['only-staged.ts', 'partial.ts'].sort());
    expect(unstaged.map((f) => f.path).sort()).toEqual(['only-unstaged.ts', 'partial.ts'].sort());
  });

  it('partiallyStaged file appears in both sections in branch mode', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('committed.ts', false)],
      files: [makeFile('partial.ts', true, 'modified', true)],
    });
    const { committed, staged, unstaged } = partitionFiles(wt);
    expect(committed.map((f) => f.path)).toEqual(['committed.ts']);
    expect(staged.map((f) => f.path)).toEqual(['partial.ts']);
    expect(unstaged.map((f) => f.path)).toEqual(['partial.ts']);
  });
});

// partitionFiles — branch mode

describe('partitionFiles — branch mode', () => {
  it('puts branchFiles in committed section', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('a.ts', false), makeFile('b.ts', false), makeFile('c.ts', false)],
    });
    const { committed, staged, unstaged } = partitionFiles(wt);
    expect(committed.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(staged).toEqual([]);
    expect(unstaged).toEqual([]);
  });

  it('splits files into staged/unstaged sections in branch mode', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      files: [makeFile('staged.ts', true), makeFile('unstaged.ts', false)],
    });
    const { committed, staged, unstaged } = partitionFiles(wt);
    expect(committed).toEqual([]);
    expect(staged.map((f) => f.path)).toEqual(['staged.ts']);
    expect(unstaged.map((f) => f.path)).toEqual(['unstaged.ts']);
  });

  it('shows all three sections when branchFiles + staged + unstaged all present', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('committed.ts', false)],
      files: [makeFile('staged.ts', true), makeFile('unstaged.ts', false)],
    });
    const { committed, staged, unstaged } = partitionFiles(wt);
    expect(committed.map((f) => f.path)).toEqual(['committed.ts']);
    expect(staged.map((f) => f.path)).toEqual(['staged.ts']);
    expect(unstaged.map((f) => f.path)).toEqual(['unstaged.ts']);
  });

  it('returns empty sections for empty file lists in branch mode', () => {
    const wt = makeWt({ diffMode: { type: 'branch', branch: 'main' }, files: [] });
    const result = partitionFiles(wt);
    expect(result).toEqual({ committed: [], staged: [], unstaged: [] });
  });

  it('sorts committed branchFiles by status then path', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [
        makeFile('z.ts', false, 'added'),
        makeFile('a.ts', false, 'modified'),
        makeFile('m.ts', false, 'added'),
      ],
    });
    const { committed } = partitionFiles(wt);
    expect(committed.map((f) => f.path)).toEqual(['m.ts', 'z.ts', 'a.ts']);
  });
});

// Store flow: applyEvent respects diffMode

describe('store applyEvent — branch mode guard', () => {
  // Import the store fresh for each test to avoid cross-test pollution
  let useWorktreeStore: typeof import('../store/index').useWorktreeStore;

  beforeEach(async () => {
    // Re-import to get a clean module (vitest resets modules if configured, otherwise
    // we reset the store state manually via setState)
    const mod = await import('../store/index');
    useWorktreeStore = mod.useWorktreeStore;
    // Reset store to initial state
    useWorktreeStore.setState({
      worktrees: new Map(),
    });
  });

  function seedWorktree(diffMode: WorktreeState['diffMode'], files: FileChange[] = []) {
    const wt: WorktreeState = makeWt({ diffMode, files });
    useWorktreeStore.getState().setWorktrees([wt]);
    return wt;
  }

  it('applies file-changed in working mode', () => {
    seedWorktree({ type: 'working' });
    useWorktreeStore.getState().applyEvent({
      type: 'file-changed',
      worktreeId: 'wt-test',
      file: makeFile('new.ts', false),
    });
    const wt = useWorktreeStore.getState().worktrees.get('wt-test')!;
    expect(wt.files).toHaveLength(1);
    expect(wt.files[0].path).toBe('new.ts');
  });

  it('applies file-changed in branch mode (working-tree changes are always tracked)', () => {
    seedWorktree({ type: 'branch', branch: 'main' });
    useWorktreeStore.getState().applyEvent({
      type: 'file-changed',
      worktreeId: 'wt-test',
      file: makeFile('new.ts', false),
    });
    const wt = useWorktreeStore.getState().worktrees.get('wt-test')!;
    expect(wt.files).toHaveLength(1);
    expect(wt.files[0].path).toBe('new.ts');
  });

  it('updateWorktreeFiles replaces files and sets diffMode', () => {
    seedWorktree({ type: 'working' }, [makeFile('agent.ts', false)]);

    const workingFiles = [makeFile('staged.ts', true), makeFile('unstaged.ts', false)];
    const branchFiles = [makeFile('committed.ts', false)];
    useWorktreeStore
      .getState()
      .updateWorktreeFiles(
        'wt-test',
        workingFiles,
        { type: 'branch', branch: 'main' },
        branchFiles
      );

    const wt = useWorktreeStore.getState().worktrees.get('wt-test')!;
    expect(wt.diffMode).toEqual({ type: 'branch', branch: 'main' });
    expect(wt.files.map((f) => f.path)).not.toContain('agent.ts');
  });

  it('after updateWorktreeFiles with branch mode, partitionFiles shows all three sections', () => {
    seedWorktree({ type: 'working' }, [makeFile('agent.ts', false)]);

    const workingFiles = [makeFile('staged.ts', true), makeFile('unstaged.ts', false)];
    const branchFiles = [makeFile('committed.ts', false)];
    useWorktreeStore
      .getState()
      .updateWorktreeFiles(
        'wt-test',
        workingFiles,
        { type: 'branch', branch: 'main' },
        branchFiles
      );

    const wt = useWorktreeStore.getState().worktrees.get('wt-test')!;
    const { committed, staged, unstaged } = partitionFiles(wt);
    expect(committed.map((f) => f.path)).toEqual(['committed.ts']);
    expect(staged.map((f) => f.path)).toEqual(['staged.ts']);
    expect(unstaged.map((f) => f.path)).toEqual(['unstaged.ts']);
  });
});
