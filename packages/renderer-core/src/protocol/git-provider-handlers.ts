import type { MessageRouter } from './message-router';
import type { DiffMode } from '../types';

/**
 * Subset of GitDataProvider that the webview protocol dispatches into.
 *
 * Any host that wants to speak this protocol — the real VSCode extension, or
 * the preview app's MockGitProvider — implements this interface. Keeping it
 * lean (only the methods the router needs) means tests don't have to stub
 * filesystem watchers, polling timers, or MCP bridges.
 *
 * If you add a new webview message that delegates straight to the provider,
 * add its method here AND wire it in `registerGitProviderHandlers`.
 */
export interface GitProviderHandlers {
  handleFileClick(worktreeId: string, filePath: string, line?: number): unknown;
  handleFolderClick(worktreeId: string, folderPath: string): unknown;
  handleLoadPlanContent(worktreeId: string): unknown;
  handleGetBranchList(worktreeId: string): unknown;
  handleCheckoutBranch(worktreeId: string, branch: string): unknown;
  handleFetchBranches(worktreeId: string): unknown;
  handleSwapBranches(worktreeId: string): unknown;
  handleAddWorktree(): unknown;
  handleRemoveWorktree(worktreeId: string): unknown;
  handleRenameWorktree(worktreeId: string, newName: string): unknown;
  handleSetDiffMode?(worktreeId: string, diffMode: DiffMode): unknown;
}

/**
 * Register the git-provider message handlers on `router`.
 *
 * Shared between the real VSCode host (`apps/vscode-ext/src/panel-handlers.ts`)
 * and the preview app's mock host so both exercise byte-identical routing.
 *
 * Host-specific concerns (view-settings persistence, telemetry, the action
 * coordinator, inspection) stay in each host — only the direct delegation to
 * `provider.handle*` methods lives here.
 *
 * NOTE: `set-diff-mode` is *not* registered here because the VSCode host
 * persists a view-settings override before delegating. If a host wants the
 * simple pass-through behavior, it can register `set-diff-mode` separately
 * to call `provider.handleSetDiffMode` directly.
 */
export function registerGitProviderHandlers(
  router: MessageRouter,
  provider: GitProviderHandlers
): void {
  router.on('file-click', (m) => {
    void provider.handleFileClick(m.worktreeId, m.filePath, m.line);
  });
  router.on('folder-click', (m) => {
    void provider.handleFolderClick(m.worktreeId, m.folderPath);
  });
  router.on('load-plan-content', (m) => {
    void provider.handleLoadPlanContent(m.worktreeId);
  });
  router.on('get-branch-list', (m) => {
    void provider.handleGetBranchList(m.worktreeId);
  });
  router.on('checkout-branch', (m) => {
    void provider.handleCheckoutBranch(m.worktreeId, m.branch);
  });
  router.on('fetch-branches', (m) => {
    void provider.handleFetchBranches(m.worktreeId);
  });
  router.on('swap-branches', (m) => {
    void provider.handleSwapBranches(m.worktreeId);
  });
  router.on('add-worktree', () => {
    void provider.handleAddWorktree();
  });
  router.on('remove-worktree', (m) => {
    void provider.handleRemoveWorktree(m.worktreeId);
  });
  router.on('rename-worktree', (m) => {
    void provider.handleRenameWorktree(m.worktreeId, m.newName);
  });
}
