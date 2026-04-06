import { execFileSync } from 'child_process';
import type { WorktreeState, FileChange, FileDiagnosticSummary } from '@shiftspace/renderer';
import type { ConfigLoader } from '../actions/configLoader';
import type { StateManager } from '../actions/stateManager';
import type { CheckResult, ShiftspaceActionConfig, SmellRule } from '../actions/types';
import type { InsightRunner } from '../insights/runner';
import { resolveCommand } from '../actions/commandResolver';
import { runCheck } from '../actions/runner';
import { runPipeline } from '../actions/pipelineRunner';

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

  async handleTool(tool: string, params: Record<string, unknown>): Promise<object> {
    switch (tool) {
      case 'get_insights':
        return this.handleGetInsights(params);
      case 'get_check_status':
        return this.handleGetCheckStatus(params);
      case 'run_check':
        return this.handleRunCheck(params);
      case 'run_pipeline':
        return this.handleRunPipeline(params);
      case 'get_changed_files':
        return this.handleGetChangedFiles(params);
      case 'get_smells':
        return this.handleGetSmells(params);
      default:
        return { error: `Unknown tool: ${tool}` };
    }
  }

  private resolveWorktree(cwd?: string): WorktreeState | null {
    const worktrees = this.deps.worktreeProvider.getWorktrees();
    if (!cwd) {
      return worktrees[0] ?? null;
    }
    let gitRoot: string;
    try {
      gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {
      return null;
    }
    return worktrees.find((wt) => wt.path === gitRoot) ?? null;
  }

  private handleGetInsights(params: Record<string, unknown>): object {
    const wt = this.resolveWorktree(params['cwd'] as string | undefined);
    if (!wt) return { error: 'No worktree found' };

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

  private handleGetCheckStatus(params: Record<string, unknown>): object {
    const wt = this.resolveWorktree(params['cwd'] as string | undefined);
    if (!wt) return { error: 'No worktree found' };

    const states = this.deps.stateManager.getWorktreeStates(wt.id);
    const actions = this.deps.configLoader.config.actions;

    return {
      worktree: { id: wt.id, branch: wt.branch },
      checks: actions.map((config) => {
        const state = states.get(config.id);
        const base: Record<string, unknown> = {
          id: config.id,
          label: config.label,
          type: config.type,
          status: state?.status ?? 'idle',
        };
        if (state?.type === 'check') {
          if (state.status === 'passed' || state.status === 'failed') {
            base['exitCode'] = state.exitCode;
            base['durationMs'] = state.durationMs;
          }
        }
        return base;
      }),
    };
  }

  private async handleRunCheck(params: Record<string, unknown>): Promise<object> {
    const checkId = params['check_id'] as string | undefined;
    if (!checkId) return { error: 'Missing required parameter: check_id' };

    const wt = this.resolveWorktree(params['cwd'] as string | undefined);
    if (!wt) return { error: 'No worktree found' };

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
      const message = err instanceof Error ? err.message : String(err);
      this.deps.stateManager.set(wt.id, checkId, { type: 'check', status: 'failed' });
      return { check: checkId, status: 'failed', error: message };
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

  private async handleRunPipeline(params: Record<string, unknown>): Promise<object> {
    const pipelineId = params['pipeline_id'] as string | undefined;
    if (!pipelineId) return { error: 'Missing required parameter: pipeline_id' };

    const wt = this.resolveWorktree(params['cwd'] as string | undefined);
    if (!wt) return { error: 'No worktree found' };

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

  private handleGetChangedFiles(params: Record<string, unknown>): object {
    const wt = this.resolveWorktree(params['cwd'] as string | undefined);
    if (!wt) return { error: 'No worktree found' };

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

  private async handleGetSmells(params: Record<string, unknown>): Promise<object> {
    const runner = this.deps.insightRunner;
    const getRules = this.deps.getSmellRules;
    if (!runner || !getRules) return { error: 'Smell analysis not available' };

    const wt = this.resolveWorktree(params['cwd'] as string | undefined);
    if (!wt) return { error: 'No worktree found' };

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
