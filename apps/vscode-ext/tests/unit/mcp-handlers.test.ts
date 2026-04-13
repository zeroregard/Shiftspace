import { describe, it, expect, vi } from 'vitest';
import { McpToolHandlers } from '../../src/mcp/handlers';
import type { McpHandlerDeps } from '../../src/mcp/handlers';
import type { WorktreeState } from '@shiftspace/renderer';
import { StateManager } from '../../src/actions/state-manager';

function makeWorktree(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-1',
    path: '/tmp',
    branch: 'main',
    files: [
      {
        path: 'src/index.ts',
        status: 'modified',
        staged: false,
        linesAdded: 10,
        linesRemoved: 3,
        lastChangedAt: Date.now(),
      },
      {
        path: 'README.md',
        status: 'added',
        staged: true,
        linesAdded: 5,
        linesRemoved: 0,
        lastChangedAt: Date.now(),
      },
    ],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: true,
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(worktrees: WorktreeState[] = [makeWorktree()]): McpHandlerDeps {
  const stateManager = new StateManager();

  return {
    worktreeProvider: {
      getWorktrees: () => worktrees,
    },
    configLoader: {
      config: {
        actions: [
          { id: 'fmt', label: 'Format', command: 'echo formatted', type: 'check', icon: 'check' },
          { id: 'lint', label: 'Lint', command: 'echo linted', type: 'check', icon: 'warning' },
          {
            id: 'test',
            label: 'Test',
            command: 'echo tested {package}',
            type: 'check',
            icon: 'beaker',
          },
        ],
        pipelines: {
          verify: { steps: ['fmt', 'lint'], stopOnFailure: true },
        },
      },
    } as unknown as McpHandlerDeps['configLoader'],
    stateManager,
    repoRoot: '/tmp',
    getPackageName: () => '',
  };
}

function setup(worktrees?: WorktreeState[]) {
  const deps = worktrees ? makeDeps(worktrees) : makeDeps();
  const handlers = new McpToolHandlers(deps);
  return { deps, handlers };
}

describe('get_changed_files', () => {
  it('returns file list with status and line counts', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('get_changed_files', {})) as Record<string, unknown>;
    expect(result['worktree']).toEqual({ id: 'wt-1', branch: 'main' });
    const files = result['files'] as Array<Record<string, unknown>>;
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      path: 'src/index.ts',
      status: 'modified',
      staged: false,
      linesAdded: 10,
      linesRemoved: 3,
    });
  });

  it('returns error when no worktree found', async () => {
    const { handlers } = setup([]);
    const result = (await handlers.handleTool('get_changed_files', {})) as Record<string, unknown>;
    expect(result['error']).toContain('No worktree found');
  });
});

describe('get_insights', () => {
  it('returns empty diagnostics when collector is not provided', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('get_insights', {})) as Record<string, unknown>;
    expect(result['worktree']).toEqual({ id: 'wt-1', branch: 'main', path: '/tmp' });
    expect(result['diagnostics']).toEqual([]);
    expect(result['insights']).toBeUndefined();
  });

  it('returns diagnostics when collector is provided', async () => {
    const { deps } = setup();
    deps.collectDiagnostics = vi.fn().mockReturnValue([
      {
        filePath: 'src/index.ts',
        errors: 2,
        warnings: 1,
        info: 0,
        hints: 0,
        details: [
          { severity: 'error' as const, message: 'Type error', source: 'ts', line: 10 },
          { severity: 'error' as const, message: 'Missing import', source: 'ts', line: 1 },
          { severity: 'warning' as const, message: 'Unused var', source: 'eslint', line: 5 },
        ],
      },
    ]);
    const rebuilt = new McpToolHandlers(deps);
    const result = (await rebuilt.handleTool('get_insights', {})) as Record<string, unknown>;
    const diagnostics = result['diagnostics'] as Array<Record<string, unknown>>;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ file: 'src/index.ts', errors: 2, warnings: 1 });
    expect((diagnostics[0]['details'] as unknown[]).length).toBe(3);
  });

  it('passes correct files and worktreeRoot to collector', async () => {
    const collector = vi.fn().mockReturnValue([]);
    const { deps } = setup();
    deps.collectDiagnostics = collector;
    const h = new McpToolHandlers(deps);
    await h.handleTool('get_insights', {});
    expect(collector).toHaveBeenCalledOnce();
    const [files, root] = collector.mock.calls[0];
    expect(root).toBe('/tmp');
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/index.ts');
  });
});

describe('get_check_status', () => {
  it('returns status for all configured checks', async () => {
    const { deps, handlers } = setup();
    deps.stateManager.set('wt-1', 'fmt', {
      type: 'check',
      status: 'passed',
      durationMs: 123,
      exitCode: 0,
    });
    deps.stateManager.set('wt-1', 'lint', {
      type: 'check',
      status: 'failed',
      durationMs: 456,
      exitCode: 1,
    });
    const result = (await handlers.handleTool('get_check_status', {})) as Record<string, unknown>;
    expect(result['worktree']).toEqual({ id: 'wt-1', branch: 'main' });
    const checks = result['checks'] as Array<Record<string, unknown>>;
    expect(checks).toHaveLength(3);
    expect(checks[0]).toMatchObject({ id: 'fmt', status: 'passed', exitCode: 0, durationMs: 123 });
    expect(checks[1]).toMatchObject({ id: 'lint', status: 'failed', exitCode: 1 });
    expect(checks[2]).toMatchObject({ id: 'test', status: 'idle' });
  });
});

describe('run_check', () => {
  it('runs a check and returns result', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('run_check', { check_id: 'fmt' })) as Record<
      string,
      unknown
    >;
    expect(result['check']).toBe('fmt');
    expect(result['status']).toBe('passed');
    expect(result['exitCode']).toBe(0);
    expect(result['stdout']).toContain('formatted');
  });

  it('updates state manager with result', async () => {
    const { deps, handlers } = setup();
    await handlers.handleTool('run_check', { check_id: 'fmt' });
    const state = deps.stateManager.get('wt-1', 'fmt');
    expect(state).toBeTruthy();
    expect(state!.type).toBe('check');
    if (state!.type === 'check') expect(state!.status).toBe('passed');
  });

  it('returns error for unknown check_id', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('run_check', { check_id: 'nonexistent' })) as Record<
      string,
      unknown
    >;
    expect(result['error']).toBe('Unknown check: nonexistent');
  });

  it('returns error when check_id is missing', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('run_check', {})) as Record<string, unknown>;
    expect(result['error']).toBe('Missing required parameter: check_id');
  });

  it('returns error when command requires package but none set', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('run_check', { check_id: 'test' })) as Record<
      string,
      unknown
    >;
    expect(result['error']).toBe('Check "test" requires a package selection');
  });
});

describe('run_pipeline', () => {
  it('runs pipeline steps sequentially and returns results', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('run_pipeline', { pipeline_id: 'verify' })) as Record<
      string,
      unknown
    >;
    expect(result['pipeline']).toBe('verify');
    expect(result['status']).toBe('passed');
    const steps = result['steps'] as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ check: 'fmt', status: 'passed' });
    expect(steps[1]).toMatchObject({ check: 'lint', status: 'passed' });
  });

  it('updates state manager for each step', async () => {
    const { deps, handlers } = setup();
    await handlers.handleTool('run_pipeline', { pipeline_id: 'verify' });
    const fmtState = deps.stateManager.get('wt-1', 'fmt');
    const lintState = deps.stateManager.get('wt-1', 'lint');
    expect(fmtState?.type === 'check' && fmtState.status).toBe('passed');
    expect(lintState?.type === 'check' && lintState.status).toBe('passed');
  });

  it('returns error for unknown pipeline_id', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('run_pipeline', {
      pipeline_id: 'nonexistent',
    })) as Record<string, unknown>;
    expect(result['error']).toBe('Unknown pipeline: nonexistent');
  });

  it('returns error when pipeline_id is missing', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('run_pipeline', {})) as Record<string, unknown>;
    expect(result['error']).toBe('Missing required parameter: pipeline_id');
  });
});

describe('unknown tool', () => {
  it('returns error for unknown tool name', async () => {
    const { handlers } = setup();
    const result = (await handlers.handleTool('not_a_tool', {})) as Record<string, unknown>;
    expect(result['error']).toBe('Unknown tool: not_a_tool');
  });
});
