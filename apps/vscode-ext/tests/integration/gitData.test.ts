import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// We mock child_process *before* importing our modules so the mock is in place
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

// After mocking, import the modules under test
import { detectWorktrees, checkGitAvailability } from '../../src/git/worktrees';
import { getFileChanges, getBranchDiffFileChanges } from '../../src/git/status';
import { execFile } from 'child_process';
import * as fs from 'fs';

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf8');

// Helper to make execFile call its callback with a successful result
function mockExecFile(stdout: string) {
  return (_cmd: unknown, _args: unknown, _opts: unknown, cb: Function) => {
    cb(null, { stdout, stderr: '' });
  };
}

function mockExecFileError(err: Error) {
  return (_cmd: unknown, _args: unknown, _opts: unknown, cb: Function) => {
    cb(err, { stdout: '', stderr: '' });
  };
}

describe('detectWorktrees (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns WorktreeState[] from realistic git output (main only)', async () => {
    vi.mocked(execFile).mockImplementation(
      mockExecFile(fixture('worktree-list-single.txt')) as any
    );

    const wts = await detectWorktrees('/some/repo');
    expect(wts).toHaveLength(1);
    expect(wts[0]).toMatchObject({
      path: '/home/user/project',
      branch: 'main',
      files: [],
    });
  });

  it('returns all worktrees from multi-worktree output', async () => {
    vi.mocked(execFile).mockImplementation(
      mockExecFile(fixture('worktree-list-multiple.txt')) as any
    );

    const wts = await detectWorktrees('/some/repo');
    expect(wts).toHaveLength(3);
    expect(wts.map((w) => w.branch)).toEqual(['main', 'feature/auth', 'fix/login-redirect']);
  });

  it('returns empty array when git command fails', async () => {
    vi.mocked(execFile).mockImplementation(
      mockExecFileError(Object.assign(new Error('not a repo'), { code: 128 })) as any
    );

    const wts = await detectWorktrees('/not/a/repo');
    expect(wts).toEqual([]);
  });

  it('handles detached HEAD worktree', async () => {
    vi.mocked(execFile).mockImplementation(
      mockExecFile(fixture('worktree-list-detached.txt')) as any
    );

    const wts = await detectWorktrees('/some/repo');
    const detached = wts[1]!;
    expect(detached.branch).toMatch(/^[0-9a-f]{8}$/);
  });

  it('skips bare worktrees', async () => {
    vi.mocked(execFile).mockImplementation(mockExecFile(fixture('worktree-list-bare.txt')) as any);

    const wts = await detectWorktrees('/some/repo');
    expect(wts).toHaveLength(1);
  });
});

describe('checkGitAvailability (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "ok" when git rev-parse succeeds', async () => {
    vi.mocked(execFile).mockImplementation(mockExecFile('') as any);
    const result = await checkGitAvailability('/some/repo');
    expect(result).toBe('ok');
  });

  it('returns "not-repo" when git command exits with error', async () => {
    vi.mocked(execFile).mockImplementation(
      mockExecFileError(Object.assign(new Error('not a git repo'), { code: 128 })) as any
    );
    const result = await checkGitAvailability('/not/a/repo');
    expect(result).toBe('not-repo');
  });

  it('returns "no-git" when git binary is missing (ENOENT)', async () => {
    vi.mocked(execFile).mockImplementation(
      mockExecFileError(
        Object.assign(new Error('git: command not found'), { code: 'ENOENT' })
      ) as any
    );
    const result = await checkGitAvailability('/any/path');
    expect(result).toBe('no-git');
  });
});

describe('getFileChanges (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds complete FileChange[] from status + diff output', async () => {
    const statusOutput = ' M src/app/page.tsx\nA  src/components/Card.tsx\n';
    const diffOutput = '12\t4\tsrc/app/page.tsx\n';
    const cachedOutput = '8\t3\tsrc/components/Card.tsx\n';

    let callCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      _args: unknown,
      _opts: unknown,
      cb: Function
    ) => {
      const outputs = [statusOutput, diffOutput, cachedOutput];
      cb(null, { stdout: outputs[callCount++ % 3] ?? '', stderr: '' });
    }) as any);

    const files = await getFileChanges('/some/worktree');
    expect(files.length).toBeGreaterThan(0);

    const page = files.find((f) => f.path === 'src/app/page.tsx');
    expect(page).toBeDefined();
    expect(page!.status).toBe('modified');
    expect(page!.staged).toBe(false);
    expect(page!.linesAdded).toBe(12);
    expect(page!.linesRemoved).toBe(4);

    const card = files.find((f) => f.path === 'src/components/Card.tsx');
    expect(card).toBeDefined();
    expect(card!.staged).toBe(true);
    expect(card!.status).toBe('added');
    // Cached diff only → linesAdded from cached
    expect(card!.linesAdded).toBe(8);
  });

  it('returns empty array when there are no changes', async () => {
    vi.mocked(execFile).mockImplementation(mockExecFile('') as any);

    const files = await getFileChanges('/clean/repo');
    expect(files).toEqual([]);
  });

  it('handles git command failure gracefully (returns partial data)', async () => {
    let callCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      _args: unknown,
      _opts: unknown,
      cb: Function
    ) => {
      if (callCount++ === 0) {
        // status succeeds
        cb(null, { stdout: '?? src/new.ts\n', stderr: '' });
      } else {
        // diff commands fail
        cb(new Error('git error'), { stdout: '', stderr: '' });
      }
    }) as any);

    const files = await getFileChanges('/some/worktree');
    // Should still return the file from status, with 0 line counts
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('src/new.ts');
    expect(files[0]!.linesAdded).toBe(0);
  });

  it('handles binary files (dash counts) without crashing', async () => {
    const statusOutput = 'M  assets/logo.png\n';
    const diffOutput = '';
    const cachedOutput = '-\t-\tassets/logo.png\n';

    let callCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      _args: unknown,
      _opts: unknown,
      cb: Function
    ) => {
      const outputs = [statusOutput, diffOutput, cachedOutput];
      cb(null, { stdout: outputs[callCount++ % 3] ?? '', stderr: '' });
    }) as any);

    const files = await getFileChanges('/some/worktree');
    expect(files).toHaveLength(1);
    expect(files[0]!.linesAdded).toBe(0);
    expect(files[0]!.linesRemoved).toBe(0);
  });

  it('reads untracked file content to get line count and synthetic diff', async () => {
    // Untracked (added + not staged): status = '?? path', all diff commands return empty
    vi.mocked(execFile).mockImplementation(mockExecFile('?? src/new.ts\n') as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue('line1\nline2\nline3\n' as any);

    const files = await getFileChanges('/some/worktree');
    expect(files).toHaveLength(1);
    const f = files[0]!;
    expect(f.path).toBe('src/new.ts');
    expect(f.linesAdded).toBe(3);
    expect(f.diff).toBeDefined();
    expect(f.diff![0]!.lines).toHaveLength(3);
    expect(f.diff![0]!.lines.every((l) => l.type === 'added')).toBe(true);
    expect(f.rawDiff).toContain('--- /dev/null');
    expect(f.rawDiff).toContain('+++ b/src/new.ts');
  });

  it('leaves untracked file with linesAdded=0 when readFile fails', async () => {
    vi.mocked(execFile).mockImplementation(mockExecFile('?? src/binary.bin\n') as any);
    vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('EACCES'));

    const files = await getFileChanges('/some/worktree');
    expect(files).toHaveLength(1);
    expect(files[0]!.linesAdded).toBe(0);
    expect(files[0]!.diff).toBeUndefined();
  });

  it('combines unstaged and staged raw diff for tracked files', async () => {
    const statusOutput = 'MM src/app/layout.tsx\n';
    const numstat = '3\t1\tsrc/app/layout.tsx\n';
    const cachedNumstat = '5\t2\tsrc/app/layout.tsx\n';
    const unstagedDiff = `diff --git a/src/app/layout.tsx b/src/app/layout.tsx
index abc..def 100644
--- a/src/app/layout.tsx
+++ b/src/app/layout.tsx
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;
    const stagedDiff = `diff --git a/src/app/layout.tsx b/src/app/layout.tsx
index def..ghi 100644
--- a/src/app/layout.tsx
+++ b/src/app/layout.tsx
@@ -3,2 +3,3 @@
 const c = 3;
+const d = 4;
`;

    const outputs = [statusOutput, numstat, cachedNumstat, unstagedDiff, stagedDiff];
    let callCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      _args: unknown,
      _opts: unknown,
      cb: Function
    ) => {
      cb(null, { stdout: outputs[callCount++] ?? '', stderr: '' });
    }) as any);

    const files = await getFileChanges('/some/worktree');
    const f = files.find((x) => x.path === 'src/app/layout.tsx')!;
    expect(f).toBeDefined();
    expect(f.rawDiff).toBeDefined();
    expect(f.rawDiff).toContain('--- a/src/app/layout.tsx');
  });
});

// ---------------------------------------------------------------------------
// getBranchDiffFileChanges (integration)
// ---------------------------------------------------------------------------
describe('getBranchDiffFileChanges (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FileChange[] from name-status + numstat + diff output', async () => {
    const nameStatus = 'A\tsrc/new-feature.ts\nM\tsrc/existing.ts\nD\tsrc/old.ts\n';
    const numstat = '50\t0\tsrc/new-feature.ts\n10\t5\tsrc/existing.ts\n0\t20\tsrc/old.ts\n';
    const diffOutput = '';

    const outputs = [nameStatus, numstat, diffOutput];
    let callCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      _args: unknown,
      _opts: unknown,
      cb: Function
    ) => {
      cb(null, { stdout: outputs[callCount++] ?? '', stderr: '' });
    }) as any);

    const files = await getBranchDiffFileChanges('/some/worktree', 'main');
    expect(files).toHaveLength(3);

    const newFile = files.find((f) => f.path === 'src/new-feature.ts')!;
    expect(newFile.status).toBe('added');
    expect(newFile.linesAdded).toBe(50);
    expect(newFile.staged).toBe(false);

    const modified = files.find((f) => f.path === 'src/existing.ts')!;
    expect(modified.status).toBe('modified');
    expect(modified.linesAdded).toBe(10);
    expect(modified.linesRemoved).toBe(5);

    const deleted = files.find((f) => f.path === 'src/old.ts')!;
    expect(deleted.status).toBe('deleted');
    expect(deleted.linesRemoved).toBe(20);
  });

  it('returns empty array when no files changed vs branch', async () => {
    vi.mocked(execFile).mockImplementation(mockExecFile('') as any);

    const files = await getBranchDiffFileChanges('/some/worktree', 'main');
    expect(files).toEqual([]);
  });

  it('returns empty array when git command fails', async () => {
    vi.mocked(execFile).mockImplementation(
      mockExecFileError(new Error('fatal: unknown revision')) as any
    );

    const files = await getBranchDiffFileChanges('/some/worktree', 'nonexistent-branch');
    expect(files).toEqual([]);
  });

  it('handles renames in name-status output', async () => {
    const nameStatus = 'R100\tsrc/old-name.ts\tsrc/new-name.ts\n';
    const numstat = '0\t0\tsrc/new-name.ts\n';

    const outputs = [nameStatus, numstat, ''];
    let callCount = 0;
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      _args: unknown,
      _opts: unknown,
      cb: Function
    ) => {
      cb(null, { stdout: outputs[callCount++] ?? '', stderr: '' });
    }) as any);

    const files = await getBranchDiffFileChanges('/some/worktree', 'main');
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('src/new-name.ts');
    expect(files[0]!.status).toBe('modified');
  });
});
