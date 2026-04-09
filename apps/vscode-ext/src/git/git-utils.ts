import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Resolved path to the git binary. Falls back to plain 'git' (relies on PATH).
 * Set once at activation via `initGitPath()`.
 */
let gitBinary = 'git';

/** Discover the git binary path from VSCode's built-in git extension or PATH. */
export function initGitPath(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const gitExt = vscode.extensions.getExtension('vscode.git')?.exports;
    const apiPath = (gitExt as any)?.getAPI?.(1)?.git?.path as string | undefined;
    if (apiPath) {
      gitBinary = apiPath;
      return;
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
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await execFileAsync(gitBinary, ['--no-optional-locks', ...args], {
        ...options,
        timeout: options.timeout ?? 10_000,
      });
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
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
  return gitQueue.enqueue(() =>
    execFileAsync(gitBinary, args, {
      ...options,
      timeout: options.timeout ?? 30_000,
    })
  );
}
