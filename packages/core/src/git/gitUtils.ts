import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
  validateGitArgs(args);
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await execFileAsync('git', ['--no-optional-locks', ...args], {
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
  // Unreachable -- loop always returns or throws
  throw new Error('gitReadOnly: unexpected loop exit');
}

/**
 * Long-form git flags that allow arbitrary command execution.
 * --upload-pack and --exec can run arbitrary binaries via git.
 * Short flags like -u are NOT included — they are overloaded
 * (e.g. `git stash push -u` means "include untracked").
 */
const DANGEROUS_GIT_FLAGS = ['--upload-pack', '--exec'];

/**
 * Reject git arguments that could enable command execution.
 * This guards against second-order injection where a caller
 * accidentally passes attacker-controlled values as git args.
 */
function validateGitArgs(args: string[]): void {
  for (const arg of args) {
    for (const flag of DANGEROUS_GIT_FLAGS) {
      if (arg === flag || arg.startsWith(`${flag}=`)) {
        throw new Error(`Blocked dangerous git flag: ${arg}`);
      }
    }
  }
}

/**
 * Run a git command that modifies the repo (checkout, stash, fetch, etc.).
 * These are serialized through the global queue so writes never overlap.
 */
export async function gitWrite(
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  validateGitArgs(args);
  return gitQueue.enqueue(() =>
    execFileAsync('git', args, {
      ...options,
      timeout: options.timeout ?? 30_000,
    })
  );
}
