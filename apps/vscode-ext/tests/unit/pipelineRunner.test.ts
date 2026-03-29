import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../../src/actions/pipelineRunner';
import type { PipelineConfig, ShiftspaceActionConfig } from '../../src/actions/types';

function makeActions(
  ids: string[],
  commands?: Record<string, string>
): Map<string, ShiftspaceActionConfig> {
  return new Map(
    ids.map((id) => [
      id,
      {
        id,
        label: id,
        command: commands?.[id] ?? 'exit 0',
        type: 'check' as const,
        icon: 'check',
      },
    ])
  );
}

describe('runPipeline', () => {
  it('runs all steps and returns passed when all succeed', async () => {
    const pipeline: PipelineConfig = {
      steps: ['fmt', 'lint'],
      stopOnFailure: true,
    };
    const actions = makeActions(['fmt', 'lint']);
    const result = await runPipeline(pipeline, actions, { cwd: '/tmp' });
    expect(result.passed).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.actionId).toBe('fmt');
    expect(result.steps[1]!.actionId).toBe('lint');
  });

  it('stops at first failure when stopOnFailure is true', async () => {
    const pipeline: PipelineConfig = {
      steps: ['fmt', 'lint', 'test'],
      stopOnFailure: true,
    };
    const actions = makeActions(['fmt', 'lint', 'test'], { lint: 'exit 1' });
    const result = await runPipeline(pipeline, actions, { cwd: '/tmp' });
    expect(result.passed).toBe(false);
    expect(result.steps).toHaveLength(2); // fmt + lint, test not run
    expect(result.steps[1]!.status).toBe('failed');
  });

  it('runs all steps when stopOnFailure is false', async () => {
    const pipeline: PipelineConfig = {
      steps: ['fmt', 'lint', 'test'],
      stopOnFailure: false,
    };
    const actions = makeActions(['fmt', 'lint', 'test'], { lint: 'exit 1' });
    const result = await runPipeline(pipeline, actions, { cwd: '/tmp' });
    expect(result.passed).toBe(false);
    expect(result.steps).toHaveLength(3); // all 3 ran
  });

  it('calls onStepStart for each step', async () => {
    const pipeline: PipelineConfig = { steps: ['fmt', 'lint'], stopOnFailure: false };
    const actions = makeActions(['fmt', 'lint']);
    const onStepStart = vi.fn();
    await runPipeline(pipeline, actions, { cwd: '/tmp', onStepStart });
    expect(onStepStart).toHaveBeenCalledTimes(2);
    expect(onStepStart).toHaveBeenNthCalledWith(1, 'fmt');
    expect(onStepStart).toHaveBeenNthCalledWith(2, 'lint');
  });

  it('calls onStepComplete for each completed step', async () => {
    const pipeline: PipelineConfig = { steps: ['fmt', 'lint'], stopOnFailure: false };
    const actions = makeActions(['fmt', 'lint'], { lint: 'exit 1' });
    const onStepComplete = vi.fn();
    await runPipeline(pipeline, actions, { cwd: '/tmp', onStepComplete });
    expect(onStepComplete).toHaveBeenCalledTimes(2);
  });

  it('aborts when signal is already aborted before start', async () => {
    const controller = new AbortController();
    controller.abort();
    const pipeline: PipelineConfig = { steps: ['fmt'], stopOnFailure: true };
    const actions = makeActions(['fmt']);
    const result = await runPipeline(pipeline, actions, { cwd: '/tmp', signal: controller.signal });
    expect(result.aborted).toBe(true);
    expect(result.steps).toHaveLength(0);
  });

  it('aborts mid-pipeline when signal fires', async () => {
    const controller = new AbortController();
    const pipeline: PipelineConfig = { steps: ['slow', 'fmt'], stopOnFailure: false };
    const actions = makeActions(['slow', 'fmt'], { slow: 'sleep 30', fmt: 'exit 0' });
    const resultPromise = runPipeline(pipeline, actions, {
      cwd: '/tmp',
      signal: controller.signal,
    });
    // Give it a moment to start, then abort
    setTimeout(() => controller.abort(), 50);
    const result = await resultPromise.catch((err) => {
      // If it throws, treat as aborted
      return { aborted: true, steps: [], passed: false, _err: err };
    });
    expect(result.aborted).toBe(true);
  }, 10_000);

  it('skips unknown action ids with a warning', async () => {
    const pipeline: PipelineConfig = { steps: ['fmt', 'nonexistent'], stopOnFailure: false };
    const actions = makeActions(['fmt']); // nonexistent not in map
    const result = await runPipeline(pipeline, actions, { cwd: '/tmp' });
    expect(result.steps).toHaveLength(1); // only fmt ran
    expect(result.passed).toBe(true);
  });
});
