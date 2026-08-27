import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { resolveBranchDiffBase } from '../../src/git/branch-base';
import { getBranchDiffFileChanges } from '../../src/git/status';
import { execFile } from 'child_process';

type ExecCallback = (
  err: (NodeJS.ErrnoException & { stderr?: string }) | null,
  result: { stdout: string; stderr: string }
) => void;

type ExecImpl = (cmd: string, args: string[], opts: unknown, cb: ExecCallback) => void;

function setExec(impl: ExecImpl): void {
  vi.mocked(execFile).mockImplementation(impl as never);
}

/** Strip the `--no-optional-locks` flag that read-only commands prepend. */
function normalize(args: string[]): string[] {
  return args[0] === '--no-optional-locks' ? args.slice(1) : args;
}

/**
 * Record every git invocation. Handler returns a success payload, an error
 * payload, or undefined (= default success with empty stdout).
 */
function recorder(
  handler?: (args: string[]) => { stdout?: string } | { error: string } | undefined
) {
  const calls: Array<string[]> = [];
  setExec((_cmd, rawArgs, _opts, cb) => {
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
  });
  return calls;
}

const isUpstreamLookup = (args: string[]) =>
  args[0] === 'rev-parse' &&
  args.includes('--abbrev-ref') &&
  args.some((a) => a.endsWith('@{upstream}'));

const isRemoteRefCheck = (args: string[]) =>
  args[0] === 'rev-parse' &&
  args.includes('--verify') &&
  args.some((a) => a.startsWith('refs/remotes/origin/'));

beforeEach(() => {
  vi.mocked(execFile).mockReset();
});

describe('resolveBranchDiffBase', () => {
  it('prefers the configured upstream of the base branch', async () => {
    recorder((args) => {
      if (isUpstreamLookup(args)) return { stdout: 'origin/staging\n' };
      return undefined;
    });

    const base = await resolveBranchDiffBase('/repo', 'staging');
    expect(base).toBe('origin/staging');
  });

  it('falls back to origin/<branch> when no upstream is configured but the remote-tracking ref exists', async () => {
    recorder((args) => {
      if (isUpstreamLookup(args)) return { error: 'fatal: no upstream configured' };
      if (isRemoteRefCheck(args)) return { stdout: 'abc123\n' };
      return undefined;
    });

    const base = await resolveBranchDiffBase('/repo', 'staging');
    expect(base).toBe('origin/staging');
  });

  it('falls back to the local name when neither upstream nor remote-tracking ref exists', async () => {
    recorder((args) => {
      if (isUpstreamLookup(args)) return { error: 'fatal: no such branch' };
      if (isRemoteRefCheck(args)) return { error: '' };
      return undefined;
    });

    const base = await resolveBranchDiffBase('/repo', 'local-only');
    expect(base).toBe('local-only');
  });
});

describe('getBranchDiffFileChanges base resolution', () => {
  it('diffs against the remote-tracking ref, not the possibly-stale local branch', async () => {
    const calls = recorder((args) => {
      if (isUpstreamLookup(args)) return { stdout: 'origin/staging\n' };
      if (args[0] === 'diff' && args.includes('--name-status')) {
        return { stdout: 'M\tsrc/app.ts\n' };
      }
      if (args[0] === 'diff' && args.includes('--numstat')) {
        return { stdout: '3\t1\tsrc/app.ts\n' };
      }
      return undefined;
    });

    const files = await getBranchDiffFileChanges('/repo', 'staging');

    const diffCalls = calls.filter((args) => args[0] === 'diff');
    expect(diffCalls.length).toBeGreaterThan(0);
    for (const args of diffCalls) {
      expect(args).toContain('origin/staging...HEAD');
      expect(args).not.toContain('staging...HEAD');
    }

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      path: 'src/app.ts',
      status: 'modified',
      linesAdded: 3,
      linesRemoved: 1,
    });
  });

  it('still diffs against the local branch when it has no remote counterpart', async () => {
    const calls = recorder((args) => {
      if (isUpstreamLookup(args)) return { error: 'fatal: no such branch' };
      if (isRemoteRefCheck(args)) return { error: '' };
      return undefined;
    });

    await getBranchDiffFileChanges('/repo', 'local-only');

    const diffCalls = calls.filter((args) => args[0] === 'diff');
    expect(diffCalls.length).toBeGreaterThan(0);
    for (const args of diffCalls) {
      expect(args).toContain('local-only...HEAD');
    }
  });
});
