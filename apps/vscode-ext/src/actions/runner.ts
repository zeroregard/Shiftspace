import { spawn } from 'child_process';
import type { CheckResult } from './types';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface RunOptions {
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

/** Run a check command and return the result. */
export function runCheck(
  command: string,
  actionId: string,
  opts: RunOptions
): Promise<CheckResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    // Use shell: true to support shell commands (pipelines, env vars, etc.)
    const child = spawn(command, [], {
      cwd: opts.cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Trim to 1MB
      if (stdout.length > 1_000_000) {
        stdout = stdout.slice(stdout.length - 1_000_000);
      }
      opts.onStdout?.(text);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 1_000_000) {
        stderr = stderr.slice(stderr.length - 1_000_000);
      }
      opts.onStderr?.(text);
    });

    // Timeout
    const timeoutHandle = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Check "${actionId}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Cancellation
    const onAbort = () => {
      clearTimeout(timeoutHandle);
      child.kill('SIGTERM');
      reject(new Error(`Check "${actionId}" was cancelled`));
    };
    opts.signal?.addEventListener('abort', onAbort);

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      opts.signal?.removeEventListener('abort', onAbort);
      const durationMs = Date.now() - startedAt;
      const exitCode = code ?? 1;
      resolve({
        actionId,
        status: exitCode === 0 ? 'passed' : 'failed',
        durationMs,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

export interface ServiceHandle {
  pid: number | undefined;
  stop(): void;
  readonly stdout: string;
  readonly stderr: string;
  onPort?: (port: number) => void;
  onExit?: (code: number | null) => void;
}

const PORT_PATTERNS = [
  /listening on[:\s]+(?:https?:\/\/[^:]+:)?(\d+)/i,
  /server running at[:\s]+(?:https?:\/\/[^:]+:)?(\d+)/i,
  /started server on[:\s]+(?:[^:]+:)?(\d+)/i,
  /port[:\s]+(\d+)/i,
  /:(\d{4,5})\b/,
];

function parsePort(text: string): number | null {
  for (const pattern of PORT_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const port = parseInt(match[1], 10);
      if (port >= 1024 && port <= 65535) return port;
    }
  }
  return null;
}

/** Start a service (long-running process). Returns a handle to stop it. */
export function startService(command: string, opts: RunOptions): ServiceHandle {
  const child = spawn(command, [], {
    cwd: opts.cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  let portDetected = false;

  const handle: ServiceHandle = {
    pid: child.pid,
    stop() {
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already dead */
        }
      }, 5000);
    },
    get stdout() {
      return stdoutBuf;
    },
    get stderr() {
      return stderrBuf;
    },
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stdoutBuf += text;
    if (stdoutBuf.length > 1_000_000) stdoutBuf = stdoutBuf.slice(stdoutBuf.length - 1_000_000);
    opts.onStdout?.(text);

    if (!portDetected) {
      const port = parsePort(text);
      if (port) {
        portDetected = true;
        handle.onPort?.(port);
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderrBuf += text;
    if (stderrBuf.length > 1_000_000) stderrBuf = stderrBuf.slice(stderrBuf.length - 1_000_000);
    opts.onStderr?.(text);

    if (!portDetected) {
      const port = parsePort(text);
      if (port) {
        portDetected = true;
        handle.onPort?.(port);
      }
    }
  });

  child.on('close', (code) => {
    handle.onExit?.(code);
  });

  return handle;
}
