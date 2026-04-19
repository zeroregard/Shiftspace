/**
 * Discriminated-union types for the MCP tool protocol.
 *
 * Every tool gets one request variant (with typed params) and one response
 * variant (success | error). The HTTP layer speaks raw `Record<string, unknown>`
 * because it comes off the wire as JSON; `parseMcpRequest` is the single
 * validating dispatcher that narrows those unknowns into typed requests. Once
 * a request is parsed, every tool handler signature is compile-checked —
 * missing or misnamed params are caught at the boundary with a precise error
 * instead of becoming a silent `undefined`.
 */

import type { FileChange, DiffMode } from '@shiftspace/renderer';

// ── Tool registry ──────────────────────────────────────────────────────────

/** All MCP tools exposed by the HTTP server. */
export type McpTool =
  | 'get_insights'
  | 'get_check_status'
  | 'run_check'
  | 'run_pipeline'
  | 'get_changed_files'
  | 'get_smells';

// ── Request params ─────────────────────────────────────────────────────────

/** Common optional `cwd` used to resolve the active worktree. */
export interface CwdParams {
  cwd?: string;
}

export type GetInsightsParams = CwdParams;
export type GetCheckStatusParams = CwdParams;
export interface RunCheckParams extends CwdParams {
  check_id: string;
}
export interface RunPipelineParams extends CwdParams {
  pipeline_id: string;
}
export type GetChangedFilesParams = CwdParams;
export type GetSmellsParams = CwdParams;

/** Typed request produced by `parseMcpRequest`. */
export type McpRequest =
  | { tool: 'get_insights'; params: GetInsightsParams }
  | { tool: 'get_check_status'; params: GetCheckStatusParams }
  | { tool: 'run_check'; params: RunCheckParams }
  | { tool: 'run_pipeline'; params: RunPipelineParams }
  | { tool: 'get_changed_files'; params: GetChangedFilesParams }
  | { tool: 'get_smells'; params: GetSmellsParams };

// ── Response shapes ────────────────────────────────────────────────────────

export interface WorktreeRef {
  id: string;
  branch: string;
}

export interface McpErrorResponse {
  error: string;
  cwd?: string;
  resolvedGitRoot?: string;
  availableWorktrees?: Array<{ id: string; path: string; branch: string }>;
}

export interface GetInsightsResponse {
  worktree: WorktreeRef & { path: string };
  diagnostics: Array<{
    file: string;
    errors: number;
    warnings: number;
    details: Array<{
      severity: 'error' | 'warning' | 'info' | 'hint';
      message: string;
      source: string;
      line: number;
    }>;
  }>;
}

export interface CheckStatusEntry {
  id: string;
  label: string;
  type: string;
  status: string;
  exitCode?: number;
  durationMs?: number;
}

export interface GetCheckStatusResponse {
  worktree: WorktreeRef;
  checks: CheckStatusEntry[];
}

export interface RunCheckResponse {
  check: string;
  status: 'passed' | 'failed';
  exitCode?: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface PipelineStepResponse {
  check: string;
  status: 'passed' | 'failed' | 'skipped';
  exitCode?: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
}

export interface RunPipelineResponse {
  pipeline: string;
  status: 'passed' | 'failed';
  aborted: boolean;
  steps: PipelineStepResponse[];
}

export interface GetChangedFilesResponse {
  worktree: WorktreeRef;
  diffMode: DiffMode;
  files: Array<Pick<FileChange, 'path' | 'status' | 'staged' | 'linesAdded' | 'linesRemoved'>>;
}

export interface GetSmellsResponse {
  worktree: WorktreeRef;
  smells: Array<{
    file: string;
    findings: Array<{
      ruleId: string;
      ruleLabel: string;
      count: number;
      threshold: number;
    }>;
  }>;
  totalSmells: number;
}

/** Success | error response per tool, indexed by `McpTool`. */
export type McpResponse = {
  get_insights: GetInsightsResponse | McpErrorResponse;
  get_check_status: GetCheckStatusResponse | McpErrorResponse;
  run_check: RunCheckResponse | McpErrorResponse;
  run_pipeline: RunPipelineResponse | McpErrorResponse;
  get_changed_files: GetChangedFilesResponse | McpErrorResponse;
  get_smells: GetSmellsResponse | McpErrorResponse;
};

// ── Validating dispatcher ──────────────────────────────────────────────────

/**
 * Parse and validate a raw `{ tool, params }` pair into a typed `McpRequest`.
 *
 * Returns an `McpErrorResponse` for:
 *  - unknown tool names
 *  - missing required string params
 *
 * This is the single place where raw JSON becomes typed. Downstream handlers
 * receive fully-narrowed params and never have to re-check types.
 */
export function parseMcpRequest(
  tool: string,
  raw: Record<string, unknown>
): McpRequest | McpErrorResponse {
  const cwd = stringOrUndefined(raw['cwd']);

  switch (tool) {
    case 'get_insights':
      return { tool: 'get_insights', params: { cwd } };
    case 'get_check_status':
      return { tool: 'get_check_status', params: { cwd } };
    case 'get_changed_files':
      return { tool: 'get_changed_files', params: { cwd } };
    case 'get_smells':
      return { tool: 'get_smells', params: { cwd } };
    case 'run_check': {
      const check_id = stringOrUndefined(raw['check_id']);
      if (!check_id) return { error: 'Missing required parameter: check_id' };
      return { tool: 'run_check', params: { cwd, check_id } };
    }
    case 'run_pipeline': {
      const pipeline_id = stringOrUndefined(raw['pipeline_id']);
      if (!pipeline_id) return { error: 'Missing required parameter: pipeline_id' };
      return { tool: 'run_pipeline', params: { cwd, pipeline_id } };
    }
    default:
      return { error: `Unknown tool: ${tool}` };
  }
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
