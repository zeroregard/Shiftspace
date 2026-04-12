import type { CheckResult, ShiftspaceActionConfig, PipelineConfig } from './types';
import type { RunOptions } from './runner';
import { runCheck } from './runner';
import { log } from '../logger';
import { reportInvariant } from '../telemetry';

interface PipelineResult {
  steps: CheckResult[];
  passed: boolean;
  aborted: boolean;
}

interface PipelineRunOptions {
  cwd: string;
  signal?: AbortSignal;
  onStepStart?: (actionId: string) => void;
  onStepComplete?: (result: CheckResult) => void;
  onStdout?: (actionId: string, chunk: string) => void;
  onStderr?: (actionId: string, chunk: string) => void;
}

/** Run a pipeline sequentially. Returns results for all steps that ran. */
export async function runPipeline(
  pipeline: PipelineConfig,
  actions: Map<string, ShiftspaceActionConfig>,
  opts: PipelineRunOptions
): Promise<PipelineResult> {
  const results: CheckResult[] = [];
  let passed = true;

  for (const stepId of pipeline.steps) {
    // Check for cancellation
    if (opts.signal?.aborted) {
      return { steps: results, passed: false, aborted: true };
    }

    const action = actions.get(stepId);
    if (!action) {
      log.warn(`Pipeline step "${stepId}" not found in actions`);
      // Config validation should have caught this during load — seeing it at
      // runtime means validation regressed or a pipeline was mutated live.
      reportInvariant('pipeline.stepNotFound', { stepId });
      continue;
    }

    opts.onStepStart?.(stepId);

    const runOpts: RunOptions = {
      cwd: opts.cwd,
      signal: opts.signal,
      onStdout: (chunk) => opts.onStdout?.(stepId, chunk),
      onStderr: (chunk) => opts.onStderr?.(stepId, chunk),
    };

    let result: CheckResult;
    try {
      result = await runCheck(action.command, stepId, runOpts);
    } catch (err) {
      // Cancelled or error
      const isAbort =
        opts.signal?.aborted || (err instanceof Error && err.message.includes('cancelled'));
      if (isAbort) {
        return { steps: results, passed: false, aborted: true };
      }
      result = {
        actionId: stepId,
        status: 'failed',
        durationMs: 0,
        exitCode: 1,
        stdout: '',
        stderr: String(err),
      };
    }

    results.push(result);
    opts.onStepComplete?.(result);

    if (result.status === 'failed') {
      passed = false;
      if (pipeline.stopOnFailure) {
        return { steps: results, passed: false, aborted: false };
      }
    }
  }

  return { steps: results, passed, aborted: false };
}
