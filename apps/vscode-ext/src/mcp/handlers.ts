import type { WorktreeState, FileChange, FileDiagnosticSummary } from '@shiftspace/renderer';
import type { ConfigLoader } from '../actions/config-loader';
import type { StateManager } from '../actions/state-manager';
import type { CheckResult, ShiftspaceActionConfig, SmellRule } from '../actions/types';
import type { InsightRunner } from '../insights/runner';
import { resolveCommand } from '../actions/command-resolver';
import { runCheck } from '../actions/runner';
import { runPipeline } from '../actions/pipeline-runner';
import { reportError } from '../telemetry';
import type {
  CwdParams,
  GetChangedFilesResponse,
  GetCheckStatusResponse,
  GetInsightsResponse,
  GetSmellsResponse,
  McpErrorResponse,
  RunCheckParams,
  RunCheckResponse,
  RunPipelineParams,
  RunPipelineResponse,
} from './protocol';
import { parseMcpRequest } from './protocol';
import { noWorktreeError, resolveWorktree } from './worktree-resolver';

export interface WorktreeProvider {
  getWorktrees(): WorktreeState[];
}

export interface McpHandlerDeps {
  worktreeProvider: WorktreeProvider;
  configLoader: ConfigLoader;
  stateManager: StateManager;
  repoRoot: string;
  getPackageName: () => string;
  collectDiagnostics?: (files: FileChange[], worktreeRoot: string) => FileDiagnosticSummary[];
  insightRunner?: InsightRunner;
  getSmellRules?: () => SmellRule[];
}

export class McpToolHandlers {
  constructor(private readonly deps: McpHandlerDeps) {}

  /**
   * Single validating entry point. Raw JSON off the wire → typed request →
   * per-tool handler. Every downstream handler receives narrowed params, so
   * a misnamed field is caught here (as "Missing required parameter: X")
   * instead of silently becoming an undefined inside a handler body.
   */
  async handleTool(tool: string, rawParams: Record<string, unknown>): Promise<object> {
    const request = parseMcpRequest(tool, rawParams);
    if ('error' in request) return request;

    switch (request.tool) {
      case 'get_insights':
        return this.handleGetInsights(request.params);
      case 'get_check_status':
        return this.handleGetCheckStatus(request.params);
      case 'run_check':
        return this.handleRunCheck(request.params);
      case 'run_pipeline':
        return this.handleRunPipeline(request.params);
      case 'get_changed_files':
        return this.handleGetChangedFiles(request.params);
      case 'get_smells':
        return this.handleGetSmells(request.params);
    }
  }

  private resolve(cwd: string | undefined): WorktreeState | McpErrorResponse {
    const worktrees = this.deps.worktreeProvider.getWorktrees();
    const wt = resolveWorktree(worktrees, cwd);
    return wt ?? noWorktreeError(worktrees, cwd);
  }

  private handleGetInsights(params: CwdParams): GetInsightsResponse | McpErrorResponse {
    const wt = this.resolve(params.cwd);
    if ('error' in wt) return wt;

    const diagnostics = this.deps.collectDiagnostics?.(wt.files, wt.path) ?? [];

    return {
      worktree: { id: wt.id, branch: wt.branch, path: wt.path },
      diagnostics: diagnostics.map((d) => ({
        file: d.filePath,
        errors: d.errors,
        warnings: d.warnings,
        details: d.details.slice(0, 20),
      })),
    };
  }

  private handleGetCheckStatus(params: CwdParams): GetCheckStatusResponse | McpErrorResponse {
    const wt = this.resolve(params.cwd);
    if ('error' in wt) return wt;

    const states = this.deps.stateManager.getWorktreeStates(wt.id);
    const actions = this.deps.configLoader.config.actions;

    return {
      worktree: { id: wt.id, branch: wt.branch },
      checks: actions.map((config) => {
        const state = states.get(config.id);
        const entry: GetCheckStatusResponse['checks'][number] = {
          id: config.id,
          label: config.label,
          type: config.type,
          status: state?.status ?? 'idle',
        };
        if (state?.type === 'check' && (state.status === 'passed' || state.status === 'failed')) {
          entry.exitCode = state.exitCode;
          entry.durationMs = state.durationMs;
        }
        return entry;
      }),
    };
  }

  private async handleRunCheck(
    params: RunCheckParams
  ): Promise<RunCheckResponse | McpErrorResponse> {
    const { check_id: checkId, cwd } = params;

    const wt = this.resolve(cwd);
    if ('error' in wt) return wt;

    const config = this.deps.configLoader.config.actions.find((a) => a.id === checkId);
    if (!config) return { error: `Unknown check: ${checkId}` };

    const command = resolveCommand(config.command, this.deps.getPackageName());
    if (command === null) return { error: `Check "${checkId}" requires a package selection` };

    this.deps.stateManager.set(wt.id, checkId, {
      type: 'check',
      status: 'running',
      startedAt: Date.now(),
    });

    let result: CheckResult;
    try {
      result = await runCheck(command, checkId, { cwd: wt.path });
    } catch (err: unknown) {
      console.error('[MCP] run_check "%s" error:', checkId, err);
      reportError(err as Error, { context: 'mcpTool', tool: 'run_check', checkId });
      this.deps.stateManager.set(wt.id, checkId, { type: 'check', status: 'failed' });
      return { check: checkId, status: 'failed', error: 'Check execution failed' };
    }

    this.deps.stateManager.set(wt.id, checkId, {
      type: 'check',
      status: result.status,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
    });

    return {
      check: checkId,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdout: result.stdout.slice(-5000),
      stderr: result.stderr.slice(-5000),
    };
  }

  private async handleRunPipeline(
    params: RunPipelineParams
  ): Promise<RunPipelineResponse | McpErrorResponse> {
    const { pipeline_id: pipelineId, cwd } = params;

    const wt = this.resolve(cwd);
    if ('error' in wt) return wt;

    const pipelines = this.deps.configLoader.config.pipelines;
    const pipeline = pipelines?.[pipelineId];
    if (!pipeline) return { error: `Unknown pipeline: ${pipelineId}` };

    const actionsMap = new Map<string, ShiftspaceActionConfig>();
    const packageName = this.deps.getPackageName();
    for (const action of this.deps.configLoader.config.actions) {
      const resolved = resolveCommand(action.command, packageName);
      if (resolved !== null) {
        actionsMap.set(action.id, { ...action, command: resolved });
      }
    }

    const result = await runPipeline(pipeline, actionsMap, {
      cwd: wt.path,
      onStepStart: (actionId) => {
        this.deps.stateManager.set(wt.id, actionId, {
          type: 'check',
          status: 'running',
          startedAt: Date.now(),
        });
      },
      onStepComplete: (stepResult) => {
        this.deps.stateManager.set(wt.id, stepResult.actionId, {
          type: 'check',
          status: stepResult.status,
          durationMs: stepResult.durationMs,
          exitCode: stepResult.exitCode,
        });
      },
    });

    return {
      pipeline: pipelineId,
      status: result.passed ? 'passed' : 'failed',
      aborted: result.aborted,
      steps: result.steps.map((r) => ({
        check: r.actionId,
        status: r.status,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        stdout: r.stdout.slice(-2000),
        stderr: r.stderr.slice(-2000),
      })),
    };
  }

  private handleGetChangedFiles(params: CwdParams): GetChangedFilesResponse | McpErrorResponse {
    const wt = this.resolve(params.cwd);
    if ('error' in wt) return wt;

    return {
      worktree: { id: wt.id, branch: wt.branch },
      diffMode: wt.diffMode,
      files: wt.files.map((f: FileChange) => ({
        path: f.path,
        status: f.status,
        staged: f.staged,
        linesAdded: f.linesAdded,
        linesRemoved: f.linesRemoved,
      })),
    };
  }

  private async handleGetSmells(params: CwdParams): Promise<GetSmellsResponse | McpErrorResponse> {
    const runner = this.deps.insightRunner;
    const getRules = this.deps.getSmellRules;
    if (!runner || !getRules) return { error: 'Smell analysis not available' };

    const wt = this.resolve(params.cwd);
    if ('error' in wt) return wt;

    const smellRules = getRules();
    if (smellRules.length === 0) {
      return {
        worktree: { id: wt.id, branch: wt.branch },
        smells: [],
        totalSmells: 0,
      };
    }

    const { details } = await runner.analyzeWorktree({
      worktreeId: wt.id,
      files: wt.files,
      repoRoot: this.deps.repoRoot,
      worktreeRoot: wt.path,
      extraSettings: { codeSmells: { smellRules } },
    });

    const smellDetail = details.find((d) => d.insightId === 'codeSmells');
    const fileInsights = smellDetail?.fileInsights ?? [];

    return {
      worktree: { id: wt.id, branch: wt.branch },
      smells: fileInsights.map((fi) => ({
        file: fi.filePath,
        findings: fi.findings.map((f) => ({
          ruleId: f.ruleId,
          ruleLabel: f.ruleLabel,
          count: f.count,
          threshold: f.threshold,
        })),
      })),
      totalSmells: fileInsights.reduce((sum, fi) => sum + fi.findings.length, 0),
    };
  }
}
