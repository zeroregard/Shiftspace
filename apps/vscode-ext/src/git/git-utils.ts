import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Resolved path to the git binary. Falls back to plain 'git' (relies on PATH).
 * Updated once the async path resolution triggered by `initGitPath()` completes.
 */
let gitBinary = 'git';

/**
 * Set to true when a git spawn fails with ENOENT (binary not found).
 * Polling loops check this flag to avoid continuing to spawn failing processes.
 */
let _gitUnavailable = false;

/**
 * Promise that resolves once the git binary path has been determined.
 * `gitReadOnly` and `gitWrite` await this before spawning any process so that
 * the correct git binary is used even if `vscode.git` activates after us.
 */
let _gitPathReady: Promise<void> = Promise.resolve();

/** Returns true when the git binary cannot be found (ENOENT on spawn). */
export function isGitUnavailable(): boolean {
  return _gitUnavailable;
}

/**
 * Start async resolution of the git binary path from VSCode's built-in git
 * extension or the `git.path` workspace setting.
 *
 * Called synchronously from `activate()`, but the heavy work (awaiting
 * `vscode.git` activation) is deferred so it never blocks extension startup.
 * All git operations await `_gitPathReady` before running.
 */
export function initGitPath(): void {
  _gitPathReady = resolveGitPathAsync();
}

async function resolveGitPathAsync(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');

    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (gitExtension) {
      // Await activation so the extension has fully resolved the git binary path.
      // Without this, getAPI(1).git.path may be undefined when Shiftspace activates
      // before vscode.git finishes its own startup sequence.
      const gitExt = gitExtension.isActive
        ? gitExtension.exports
        : await gitExtension.activate();
      const apiPath = (gitExt as any)?.getAPI?.(1)?.git?.path as string | undefined;
      if (apiPath) {
        gitBinary = apiPath;
        return;
      }
    }

    // Fallback: check VSCode setting
    const configured = vscode.workspace.getConfiguration('git').get<string>('path');
    if (configured) {
      gitBinary = configured;
    }
  } catch {
    // Running outside VSCode (tests) — keep default 'git'
  }
}

/**
 * Serializes write git operations so they never run concurrently against the
 * same repo. All `gitWrite` calls are enqueued here.
 */
class GitCommandQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = false;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        }
      });
      void this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const fn = this.queue.shift()!;
    try {
      await fn();
    } finally {
      this.running = false;
      void this.processNext();
    }
  }

  /** Returns true while a write operation is in flight or queued. */
  isActive(): boolean {
    return this.running || this.queue.length > 0;
  }
}

export const gitQueue = new GitCommandQueue();

/**
 * Run a read-only git command with --no-optional-locks.
 * Retries up to 2 times on transient index.lock errors.
 * Use for ALL git commands that do not modify the repo.
 */
export async function gitReadOnly(
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  // Wait for the git binary path to be resolved before spawning any process.
  await _gitPathReady;

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await execFileAsync(gitBinary, ['--no-optional-locks', ...args], {
        ...options,
        timeout: options.timeout ?? 10_000,
      });
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string; code?: string };

      // Binary not found — mark unavailable so callers can stop retrying.
      if (e.code === 'ENOENT') {
        _gitUnavailable = true;
        throw err;
      }

      const isLockError =
        e.stderr?.includes('index.lock') ||
        e.stderr?.includes('Unable to create') ||
        e.stderr?.includes('another git process');
      if (isLockError && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  // Unreachable — loop always returns or throws
  throw new Error('gitReadOnly: unexpected loop exit');
}

/**
 * Run a git command that modifies the repo (checkout, stash, fetch, etc.).
 * These are serialized through the global queue so writes never overlap.
 */
export async function gitWrite(
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  // Resolve the git path before enqueueing so `gitBinary` is correct when the
  // closure captures it (avoids using the 'git' default if vscode.git is slow).
  await _gitPathReady;
  return gitQueue.enqueue(() =>
    execFileAsync(gitBinary, args, {
      ...options,
      timeout: options.timeout ?? 30_000,
    })
  );
}
