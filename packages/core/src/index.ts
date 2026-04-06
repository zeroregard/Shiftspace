// Logger
export { log, setLogger } from './logger';
export type { Logger } from './logger';

// Actions
export type {
  ShiftspaceActionConfig,
  PipelineConfig,
  SmellRule,
  ShiftspaceConfig,
  CheckStatus,
  ServiceStatus,
  ActionStatus,
  CheckState,
  ServiceState,
  ActionState,
  CheckResult,
  SerializedActionState,
} from './actions/types';
export { resolveCommand, requiresPackage } from './actions/commandResolver';
export { runCheck, startService } from './actions/runner';
export type { RunOptions, ServiceHandle } from './actions/runner';
export { runPipeline } from './actions/pipelineRunner';
export type { PipelineResult, PipelineRunOptions } from './actions/pipelineRunner';
export { StateManager } from './actions/stateManager';
export { LogStore } from './actions/logStore';
export { detectPackages } from './actions/packageDetector';

// Git
export { gitReadOnly, gitWrite, gitQueue } from './git/gitUtils';
export {
  parseStatusOutput,
  parseNumstatOutput,
  parseRawDiffSections,
  parseDiffOutput,
  buildFileChanges,
  parseBranchNameStatus,
  getBranchDiffFileChanges,
  getRepoFiles,
  getFileChanges,
} from './git/status';
export { diffFileChanges } from './git/eventDiff';
export { filterIgnoredFiles } from './git/ignoreFilter';
export {
  parseWorktreeOutput,
  detectWorktrees,
  getGitRoot,
  getDefaultBranch,
  listBranches,
  checkoutBranch,
  fetchRemote,
  checkWorktreeSafety,
  recoverStuckTempBranch,
  swapBranches,
  removeWorktree,
  moveWorktree,
  checkGitAvailability,
} from './git/worktrees';

// Insights
export type {
  InsightSummary,
  AnalyzeContext,
  InsightPlugin,
  InsightFinding,
  FileInsight,
  InsightDetail,
} from './insights/types';
export { insightRegistry, InsightRegistry } from './insights/registry';
export { InsightRunner } from './insights/runner';
export type { InsightRunnerOpts } from './insights/runner';
// Side-effect: register built-in plugins
import './insights/plugins/codeSmells';

// MCP
export { McpToolHandlers } from './mcp/handlers';
export type { WorktreeProvider, ConfigProvider, McpHandlerDeps } from './mcp/handlers';
export { ShiftspaceMcpHttpServer, LOCK_DIR, LOCK_FILE } from './mcp/httpServer';
