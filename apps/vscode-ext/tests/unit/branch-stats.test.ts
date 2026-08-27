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

function recorder(handler?: (args: string[]) => { stdout?: string } | { error: string } | void) {
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
    expect(perFile.get('src/app.ts')).toEqual({ added: 10, removed: 4 });
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

    expect(toDiffStats(await getBranchDiffStats('/repo/wt', 'main'))).toEqual({
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

    expect(toDiffStats(await getBranchDiffStats('/repo/wt', 'main'))).toEqual({
      fileCount: 1,
      linesAdded: 0,
      linesRemoved: 0,
    });
  });

  it('falls back to the base ref when there is no merge base', async () => {
    const calls = recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { error: 'fatal: no merge base' };
    });

    await getBranchDiffStats('/repo/wt', 'main');
    expect(calls).toContainEqual(['diff', '--numstat', 'main']);
  });

  it('reports the tracked changes it has when listing untracked files fails', async () => {
    recorder((args) => {
      const fail = baseLookupFailure(args);
      if (fail) return fail;
      if (args[0] === 'merge-base') return { stdout: 'abc1234\n' };
      if (args[0] === 'diff') return { stdout: '7\t2\tsrc/app.ts\n' };
      if (args[0] === 'ls-files') return { error: 'fatal: boom' };
    });

    expect(toDiffStats(await getBranchDiffStats('/repo/wt', 'main'))).toEqual({
      fileCount: 1,
      linesAdded: 7,
      linesRemoved: 2,
    });
  });
});
