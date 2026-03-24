import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// We mock child_process *before* importing our modules so the mock is in place
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// After mocking, import the modules under test
import { detectWorktrees, checkGitAvailability } from '../../src/git/worktrees';
import { getFileChanges } from '../../src/git/status';
import { execFile } from 'child_process';

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
});
