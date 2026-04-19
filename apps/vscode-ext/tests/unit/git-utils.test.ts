import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { gitReadOnly, gitWrite, gitQueue } from '../../src/git/git-utils';
import { execFile } from 'child_process';

type ExecCallback = (
  err: (NodeJS.ErrnoException & { stderr?: string }) | null,
  result: { stdout: string; stderr: string }
) => void;

type ExecImpl = (cmd: string, args: string[], opts: unknown, cb: ExecCallback) => void;

function setExec(impl: ExecImpl): void {
  vi.mocked(execFile).mockImplementation(impl as never);
}

function mockSuccess(stdout = '', stderr = ''): ExecImpl {
  return (_cmd, _args, _opts, cb) => cb(null, { stdout, stderr });
}

function mockError(fields: { stderr?: string; code?: string; message?: string }): ExecImpl {
  return (_cmd, _args, _opts, cb) => {
    const err = Object.assign(new Error(fields.message ?? 'boom'), {
      stderr: fields.stderr ?? '',
      code: fields.code,
    }) as NodeJS.ErrnoException & { stderr?: string };
    cb(err, { stdout: '', stderr: fields.stderr ?? '' });
  };
}

/** Reject calls in order; once the list is exhausted, succeed. */
function mockSequence(
  responses: Array<
    { stdout?: string; stderr?: string } | { errorStderr?: string; errorCode?: string }
  >
): ExecImpl {
  let i = 0;
  return (_cmd, _args, _opts, cb) => {
    const resp = responses[i++];
    if (!resp) {
      cb(null, { stdout: '', stderr: '' });
      return;
    }
    if ('errorStderr' in resp || 'errorCode' in resp) {
      const err = Object.assign(new Error('err'), {
        stderr: resp.errorStderr ?? '',
        code: resp.errorCode,
      }) as NodeJS.ErrnoException & { stderr?: string };
      cb(err, { stdout: '', stderr: resp.errorStderr ?? '' });
      return;
    }
    cb(null, { stdout: resp.stdout ?? '', stderr: resp.stderr ?? '' });
  };
}

// Drain the queue between tests so cross-test state can't leak.
async function drainQueue(): Promise<void> {
  while (gitQueue.isActive()) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ---------------------------------------------------------------------------
// gitReadOnly
// ---------------------------------------------------------------------------

describe('gitReadOnly', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prepends --no-optional-locks before the caller args', async () => {
    let receivedArgs: string[] = [];
    setExec((_cmd, args, _opts, cb) => {
      receivedArgs = args;
      cb(null, { stdout: 'ok', stderr: '' });
    });
    await gitReadOnly(['status', '--porcelain'], { cwd: '/repo' });
    expect(receivedArgs[0]).toBe('--no-optional-locks');
    expect(receivedArgs.slice(1)).toEqual(['status', '--porcelain']);
  });

  it('returns stdout and stderr verbatim on success', async () => {
    setExec(mockSuccess('line1\nline2\n', 'warn'));
    const out = await gitReadOnly(['rev-parse', 'HEAD'], { cwd: '/repo' });
    expect(out).toEqual({ stdout: 'line1\nline2\n', stderr: 'warn' });
  });

  it('applies a default 10s timeout when none is supplied', async () => {
    let seenTimeout: number | undefined;
    setExec((_cmd, _args, opts, cb) => {
      seenTimeout = (opts as { timeout?: number }).timeout;
      cb(null, { stdout: '', stderr: '' });
    });
    await gitReadOnly(['status'], { cwd: '/repo' });
    expect(seenTimeout).toBe(10_000);
  });

  it('respects a caller-supplied timeout', async () => {
    let seenTimeout: number | undefined;
    setExec((_cmd, _args, opts, cb) => {
      seenTimeout = (opts as { timeout?: number }).timeout;
      cb(null, { stdout: '', stderr: '' });
    });
    await gitReadOnly(['status'], { cwd: '/repo', timeout: 2000 });
    expect(seenTimeout).toBe(2000);
  });

  it('retries on "index.lock" errors and succeeds on a later attempt', async () => {
    setExec(
      mockSequence([
        { errorStderr: 'fatal: Unable to create index.lock: File exists' },
        { stdout: 'ok' },
      ])
    );
    const out = await gitReadOnly(['status'], { cwd: '/repo' });
    expect(out.stdout).toBe('ok');
    expect(vi.mocked(execFile)).toHaveBeenCalledTimes(2);
  });

  it('retries up to 2 additional times (3 total) before surfacing the error', async () => {
    setExec(mockError({ stderr: 'Unable to create index.lock: another git process' }));
    await expect(gitReadOnly(['status'], { cwd: '/repo' })).rejects.toThrow(/index\.lock/);
    expect(vi.mocked(execFile)).toHaveBeenCalledTimes(3);
  });

  it('does not retry for non-lock errors', async () => {
    setExec(mockError({ stderr: 'fatal: not a git repository' }));
    await expect(gitReadOnly(['status'], { cwd: '/repo' })).rejects.toThrow(/not a git repository/);
    expect(vi.mocked(execFile)).toHaveBeenCalledTimes(1);
  });

  it('wraps ENOENT with a helpful "git binary not found" message and preserves code', async () => {
    setExec(mockError({ code: 'ENOENT', message: 'spawn git ENOENT' }));
    let caught: unknown;
    try {
      await gitReadOnly(['status'], { cwd: '/repo' });
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toMatch(/git binary not found/);
    expect((caught as NodeJS.ErrnoException).code).toBe('ENOENT');
  });

  it('wraps EACCES with a "not executable" message', async () => {
    setExec(mockError({ code: 'EACCES' }));
    await expect(gitReadOnly(['status'], { cwd: '/repo' })).rejects.toThrow(/not executable/);
  });

  it('prefers the stderr message when neither ENOENT nor EACCES', async () => {
    setExec(mockError({ stderr: '  fatal: custom failure  \n' }));
    await expect(gitReadOnly(['status'], { cwd: '/repo' })).rejects.toThrow(
      'fatal: custom failure'
    );
  });
});

// ---------------------------------------------------------------------------
// gitWrite
// ---------------------------------------------------------------------------

describe('gitWrite', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('does NOT prepend --no-optional-locks', async () => {
    let receivedArgs: string[] = [];
    setExec((_cmd, args, _opts, cb) => {
      receivedArgs = args;
      cb(null, { stdout: '', stderr: '' });
    });
    await gitWrite(['checkout', 'main'], { cwd: '/repo' });
    expect(receivedArgs).toEqual(['checkout', 'main']);
  });

  it('applies a default 30s timeout when none is supplied', async () => {
    let seenTimeout: number | undefined;
    setExec((_cmd, _args, opts, cb) => {
      seenTimeout = (opts as { timeout?: number }).timeout;
      cb(null, { stdout: '', stderr: '' });
    });
    await gitWrite(['checkout', 'main'], { cwd: '/repo' });
    expect(seenTimeout).toBe(30_000);
  });

  it('wraps execution errors via rethrowGitError (stderr takes precedence)', async () => {
    setExec(mockError({ stderr: 'fatal: boom' }));
    await expect(gitWrite(['checkout', 'main'], { cwd: '/repo' })).rejects.toThrow('fatal: boom');
  });
});

// ---------------------------------------------------------------------------
// GitCommandQueue (exercised through gitWrite + gitQueue)
// ---------------------------------------------------------------------------

describe('GitCommandQueue', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await drainQueue();
  });

  it('serializes concurrent gitWrite calls — second runs only after the first finishes', async () => {
    const events: string[] = [];
    const releasers: Array<() => void> = [];
    setExec((_cmd, args, _opts, cb) => {
      const label = args.join(' ');
      events.push(`start:${label}`);
      releasers.push(() => {
        events.push(`end:${label}`);
        cb(null, { stdout: '', stderr: '' });
      });
    });

    const p1 = gitWrite(['checkout', 'A'], { cwd: '/repo' });
    const p2 = gitWrite(['checkout', 'B'], { cwd: '/repo' });

    // Allow the first enqueue to run up to the spawn
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['start:checkout A']); // B has not started yet
    expect(gitQueue.isActive()).toBe(true);

    // Release the first call; the second should now start
    releasers[0]!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['start:checkout A', 'end:checkout A', 'start:checkout B']);

    // Release the second
    releasers[1]!();
    await Promise.all([p1, p2]);
    expect(events).toEqual([
      'start:checkout A',
      'end:checkout A',
      'start:checkout B',
      'end:checkout B',
    ]);
    expect(gitQueue.isActive()).toBe(false);
  });

  it('continues processing after a task throws', async () => {
    let call = 0;
    setExec((_cmd, _args, _opts, cb) => {
      call += 1;
      if (call === 1) {
        const err = Object.assign(new Error('boom'), { stderr: 'fatal: boom' });
        cb(err as NodeJS.ErrnoException & { stderr?: string }, { stdout: '', stderr: '' });
      } else {
        cb(null, { stdout: 'ok', stderr: '' });
      }
    });

    const failing = gitWrite(['checkout', 'A'], { cwd: '/repo' });
    const succeeding = gitWrite(['checkout', 'B'], { cwd: '/repo' });

    await expect(failing).rejects.toThrow('fatal: boom');
    await expect(succeeding).resolves.toEqual({ stdout: 'ok', stderr: '' });
    expect(gitQueue.isActive()).toBe(false);
  });

  it('reports isActive() === false after the queue fully drains', async () => {
    setExec(mockSuccess('ok'));
    await gitWrite(['checkout', 'A'], { cwd: '/repo' });
    expect(gitQueue.isActive()).toBe(false);
  });

  it('enqueue resolves with the task return value', async () => {
    setExec(mockSuccess('hello'));
    const result = await gitWrite(['log', '-1'], { cwd: '/repo' });
    expect(result.stdout).toBe('hello');
  });
});
