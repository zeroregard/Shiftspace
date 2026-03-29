import type { ActionConfig, ActionState, PipelineConfig } from '@shiftspace/renderer';

export const MOCK_ACTION_CONFIGS: ActionConfig[] = [
  { id: 'fmt', label: 'Format', icon: 'whitespace', persistent: false, type: 'check' },
  { id: 'lint', label: 'Lint', icon: 'checklist', persistent: false, type: 'check' },
  { id: 'typecheck', label: 'Typecheck', icon: 'check', persistent: false, type: 'check' },
  { id: 'test', label: 'Test', icon: 'beaker', persistent: false, type: 'check' },
  { id: 'build', label: 'Build', icon: 'tools', persistent: false, type: 'check' },
  { id: 'dev-preview', label: 'Preview Dev', icon: 'play', persistent: true, type: 'service' },
];

export const MOCK_PIPELINES: Record<string, PipelineConfig> = {
  verify: { steps: ['fmt', 'lint', 'typecheck', 'test'], stopOnFailure: true },
};

/** Returns varied initial states so the preview shows a realistic mix. */
export function getMockInitialStates(
  _worktreeId: string
): Array<{ actionId: string; state: ActionState }> {
  const initialStatuses: ActionState[] = [
    { status: 'passed', durationMs: 1200 },
    { status: 'failed', durationMs: 3400 },
    { status: 'stale', durationMs: 800 },
    { status: 'idle' },
    { status: 'idle' },
  ];

  return MOCK_ACTION_CONFIGS.filter((c) => c.type === 'check').map((config, i) => ({
    actionId: config.id,
    state: initialStatuses[i % initialStatuses.length]!,
  }));
}

/** Simulate running a single check: resolves after a short delay with pass or fail. */
export function simulateCheck(
  worktreeId: string,
  actionId: string,
  onStateChange: (worktreeId: string, actionId: string, state: ActionState) => void
): () => void {
  let cancelled = false;
  const durationMs = 800 + Math.random() * 2000;

  onStateChange(worktreeId, actionId, { status: 'running' });

  const timer = setTimeout(() => {
    if (cancelled) return;
    const passed = Math.random() > 0.35;
    onStateChange(worktreeId, actionId, {
      status: passed ? 'passed' : 'failed',
      durationMs: Math.round(durationMs),
    });
  }, durationMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

/** Simulate running a pipeline: runs each step sequentially with per-step updates. */
export function simulatePipeline(
  worktreeId: string,
  pipelineId: string,
  pipelines: Record<string, PipelineConfig>,
  onStateChange: (worktreeId: string, actionId: string, state: ActionState) => void
): () => void {
  const pipeline = pipelines[pipelineId];
  if (!pipeline) return () => undefined;

  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  let cumulativeDelay = 0;
  for (const stepId of pipeline.steps) {
    const stepDelay = cumulativeDelay;
    const stepDuration = 800 + Math.random() * 1500;
    cumulativeDelay += stepDuration + 100;

    const startTimer = setTimeout(() => {
      if (cancelled) return;
      onStateChange(worktreeId, stepId, { status: 'running' });
    }, stepDelay);
    timers.push(startTimer);

    const endTimer = setTimeout(() => {
      if (cancelled) return;
      const passed = Math.random() > 0.3;
      onStateChange(worktreeId, stepId, {
        status: passed ? 'passed' : 'failed',
        durationMs: Math.round(stepDuration),
      });
      if (!passed && pipeline.stopOnFailure) {
        cancelled = true;
      }
    }, stepDelay + stepDuration);
    timers.push(endTimer);
  }

  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
  };
}
