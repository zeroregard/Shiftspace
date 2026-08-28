/**
 * The default-branch counter measures a branch by what it will bring, not by
 * what it has already committed: an agent halfway through a task has most of
 * its work sitting uncommitted, and a counter that ignored that would read
 * zero until the commit landed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

const readFileMock = vi.fn<(path: string, encoding: string) => Promise<string>>();

vi.mock('fs', () => ({
  promises: { readFile: (p: string, e: string) => readFileMock(p, e) },
}));

import { getBranchDiffStats, toDiffStats } from '../../src/git/branch-stats';
import { execFile } from 'child_process';

type ExecCallback = (
  err: (NodeJS.ErrnoException & { stderr?: string }) | null,
  result: { stdout: string; stderr: string }
) => void;

/** Strip the `--no-optional-locks` flag that read-only commands prepend. */
function normalize(args: string[]): string[] {
  return args[0] === '--no-optional-locks' ? args.slice(1) : args;
}

type MockResponse = { stdout?: string } | { error: string } | { exitCode: number } | void;

function recorder(handler?: (args: string[]) => MockResponse) {
  const calls: string[][] = [];
  vi.mocked(execFile).mockImplementation(((
    _cmd: string,
    rawArgs: string[],
    _opts: unknown,
    cb: ExecCallback
  ) => {
    const args = normalize(rawArgs);
    calls.push(args);
    const resp = handler?.(args);
    if (resp && 'error' in resp) {
      cb(Object.assign(new Error(resp.error), { stderr: resp.error }), {
        stdout: '',
        stderr: resp.error,
      });
      return;
    }
    if (resp && 'exitCode' in resp) {
      // How `git merge-base` reports "no common ancestor": exit 1, silent.
      cb(Object.assign(new Error('Command failed'), { code: resp.exitCode, stderr: '' }), {
        stdout: '',
        stderr: '',
      });
      return;
    }
    cb(null, { stdout: resp?.stdout ?? '', stderr: '' });
  }) as never);
  return calls;
}

/** Default base resolution: no upstream, no remote ref → the local branch name. */
function baseLookupFailure(args: string[]): { error: string } | void {
  if (args[0] === 'rev-parse') return { error: 'fatal: no upstream' };
}

beforeEach(() => {
  vi.mocked(execFile).mockReset();
  readFileMock.mockReset();
  readFileMock.mockRejectedValue(new Error('unreadable'));
});

describe('getBranchDiffStats', () => {
  it('measures the working tree against the merge base, not HEAD against it', async () => {
    const calls = recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { stdout: 'abc1234\n' };
      if (args[0] === 'diff') return { stdout: '10\t4\tsrc/app.ts\n' };
    });

    const perFile = await getBranchDiffStats('/repo/wt', 'main');

    expect(calls).toContainEqual(['merge-base', 'main', 'HEAD']);
    // The merge base alone (no `...HEAD`), so uncommitted work is included.
    expect(calls).toContainEqual(['diff', '--numstat', 'abc1234']);
    expect(perFile!.get('src/app.ts')).toEqual({ added: 10, removed: 4 });
  });

  it('counts untracked files, which git diff never reports', async () => {
    recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { stdout: 'abc1234\n' };
      if (args[0] === 'diff') return { stdout: '10\t4\tsrc/app.ts\n' };
      if (args[0] === 'ls-files') return { stdout: 'src/new.ts\nnotes.md\n' };
    });
    readFileMock.mockImplementation((p: string) =>
      Promise.resolve(p.endsWith('new.ts') ? 'a\nb\nc\n' : 'one line')
    );

    expect(toDiffStats((await getBranchDiffStats('/repo/wt', 'main'))!)).toEqual({
      fileCount: 3,
      linesAdded: 14, // 10 tracked + 3 + 1 untracked
      linesRemoved: 4,
    });
  });

  it('still counts an unreadable or binary untracked file as a changed file', async () => {
    recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { stdout: 'abc1234\n' };
      if (args[0] === 'ls-files') return { stdout: 'logo.png\n' };
    });

    expect(toDiffStats((await getBranchDiffStats('/repo/wt', 'main'))!)).toEqual({
      fileCount: 1,
      linesAdded: 0,
      linesRemoved: 0,
    });
  });

  it('reports the diff as unmeasurable when there is no merge base, instead of diffing the base tip', async () => {
    // Shallow clone whose history stops before the branch point: merge-base
    // exits 1. Diffing against the base tip here would show everyone else's
    // work on the base reversed — the 589-files-for-a-20-file-branch bug.
    const calls = recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { exitCode: 1 };
    });

    expect(await getBranchDiffStats('/repo/wt', 'main')).toBeNull();
    expect(calls.some((args) => args[0] === 'diff')).toBe(false);
  });

  it('propagates a transient merge-base failure so callers keep their previous counts', async () => {
    recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { error: 'fatal: index.lock exists' };
    });

    await expect(getBranchDiffStats('/repo/wt', 'main')).rejects.toThrow();
  });

  it('reports the tracked changes it has when listing untracked files fails', async () => {
    recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { stdout: 'abc1234\n' };
      if (args[0] === 'diff') return { stdout: '7\t2\tsrc/app.ts\n' };
      if (args[0] === 'ls-files') return { error: 'fatal: boom' };
    });

    expect(toDiffStats((await getBranchDiffStats('/repo/wt', 'main'))!)).toEqual({
      fileCount: 1,
      linesAdded: 7,
      linesRemoved: 2,
    });
  });
});
