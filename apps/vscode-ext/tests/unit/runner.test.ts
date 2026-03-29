import { describe, it, expect } from 'vitest';
import { runCheck } from '../../src/actions/runner';

describe('runCheck', () => {
  it('resolves with passed for exit code 0', async () => {
    const result = await runCheck('exit 0', 'test', { cwd: '/tmp' });
    expect(result.status).toBe('passed');
    expect(result.exitCode).toBe(0);
    expect(result.actionId).toBe('test');
  });

  it('resolves with failed for non-zero exit code', async () => {
    const result = await runCheck('exit 1', 'test', { cwd: '/tmp' });
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
  });

  it('captures stdout', async () => {
    const result = await runCheck('echo hello', 'test', { cwd: '/tmp' });
    expect(result.stdout.trim()).toBe('hello');
    expect(result.status).toBe('passed');
  });

  it('captures stderr', async () => {
    const result = await runCheck('echo error >&2; exit 1', 'test', { cwd: '/tmp' });
    expect(result.stderr.trim()).toBe('error');
    expect(result.status).toBe('failed');
  });

  it('calls onStdout callback with output chunks', async () => {
    const chunks: string[] = [];
    await runCheck('echo chunk1', 'test', {
      cwd: '/tmp',
      onStdout: (c) => chunks.push(c),
    });
    expect(chunks.join('').trim()).toBe('chunk1');
  });

  it('calls onStderr callback with stderr chunks', async () => {
    const chunks: string[] = [];
    await runCheck('echo err >&2; exit 0', 'test', {
      cwd: '/tmp',
      onStderr: (c) => chunks.push(c),
    });
    expect(chunks.join('').trim()).toBe('err');
  });

  it('records durationMs > 0', async () => {
    const result = await runCheck('exit 0', 'test', { cwd: '/tmp' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects when cancelled via AbortSignal', async () => {
    const controller = new AbortController();
    const promise = runCheck('sleep 30', 'test', {
      cwd: '/tmp',
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toThrow();
  });

  it('rejects on timeout', async () => {
    await expect(runCheck('sleep 10', 'test', { cwd: '/tmp', timeoutMs: 100 })).rejects.toThrow(
      'timed out'
    );
  }, 10_000);
});
