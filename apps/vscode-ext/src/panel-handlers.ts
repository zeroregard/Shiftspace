import type { MessageRouter } from './webview/message-router';
import type { SharedGitProvider } from './shared-git-provider';
import type { ActionCoordinator } from './actions/action-coordinator';
import type { ViewSettingsStore } from './view-settings-store';
import type { InspectionSession } from './insights/inspection-session';
import type { DiffMode, GitProviderHandlers } from '@shiftspace/renderer';
import { registerGitProviderHandlers } from '@shiftspace/renderer';
import { log } from './logger';
import { reportUnexpectedState } from './telemetry';

export interface PanelHandlerDeps {
  sharedGit: SharedGitProvider;
  actionCoordinator: ActionCoordinator | undefined;
  viewSettings: ViewSettingsStore | undefined;
  inspection: InspectionSession | undefined;
}

export function registerPanelHandlers(
  router: MessageRouter,
  deps: PanelHandlerDeps,
  onReady: () => void
): void {
  const { sharedGit, actionCoordinator, viewSettings, inspection } = deps;

  router.clear();

  router.on('ready', onReady);

  // Git provider handlers — delegate to the shared GitDataProvider. The
  // direct pass-through handlers live in a shared registrar so the preview
  // app exercises byte-identical routing; see
  // `packages/renderer-core/src/protocol/git-provider-handlers.ts`.
  const providerProxy: GitProviderHandlers = {
    handleFileClick: (worktreeId, filePath, line) =>
      sharedGit.provider?.handleFileClick(worktreeId, filePath, line),
    handleFolderClick: (worktreeId, folderPath) =>
      sharedGit.provider?.handleFolderClick(worktreeId, folderPath),
    handleGetBranchList: (worktreeId) => sharedGit.provider?.handleGetBranchList(worktreeId),
    handleCheckoutBranch: (worktreeId, branch) =>
      sharedGit.provider?.handleCheckoutBranch(worktreeId, branch),
    handleFetchBranches: (worktreeId) => sharedGit.provider?.handleFetchBranches(worktreeId),
    handleSwapBranches: (worktreeId) => sharedGit.provider?.handleSwapBranches(worktreeId),
    handleAddWorktree: () => sharedGit.provider?.handleAddWorktree(),
    handleRemoveWorktree: (worktreeId) => sharedGit.provider?.handleRemoveWorktree(worktreeId),
    handleRenameWorktree: (worktreeId, newName) =>
      sharedGit.provider?.handleRenameWorktree(worktreeId, newName),
  };
  registerGitProviderHandlers(router, providerProxy);

  // set-diff-mode has extra extension-specific behavior (view-settings
  // persistence) so it stays here and is registered AFTER the shared
  // registrar (which intentionally omits set-diff-mode).
  router.on('set-diff-mode', (m) => {
    if (!m.worktreeId || !m.diffMode) return;
    const diffMode = m.diffMode as DiffMode;
    const wt = sharedGit.provider?.getWorktrees().find((w) => w.id === m.worktreeId);
    if (wt) {
      const settings = viewSettings!.get();
      settings.diffModeOverrides[wt.branch] = diffMode;
      viewSettings!.save({ diffModeOverrides: settings.diffModeOverrides });
    }
    void sharedGit.provider?.handleSetDiffMode(m.worktreeId, diffMode);
  });

  // Action coordinator handlers
  router.on('run-action', (m) => {
    if (m.worktreeId && m.actionId) void actionCoordinator?.runAction(m.worktreeId, m.actionId);
  });
  router.on('stop-action', (m) => {
    if (m.worktreeId && m.actionId) actionCoordinator?.stopAction(m.worktreeId, m.actionId);
  });
  router.on('run-pipeline', (m) => {
    if (m.worktreeId && m.pipelineId)
      void actionCoordinator?.runPipeline(m.worktreeId, m.pipelineId);
  });
  router.on('cancel-pipeline', (m) => {
    if (m.worktreeId) actionCoordinator?.cancelPipeline(m.worktreeId);
  });
  router.on('get-log', (m) => {
    if (m.worktreeId && m.actionId) actionCoordinator?.getLog(m.worktreeId, m.actionId);
  });
  router.on('set-package', (m) => {
    if (m.packageName === undefined) return;
    viewSettings!.save({ selectedPackage: m.packageName });
    void actionCoordinator?.setPackage(m.packageName);
  });
  router.on('detect-packages', () => {
    void actionCoordinator?.detectAndSendPackages();
  });

  // Inspection handlers
  router.on('enter-inspection', (m) => {
    if (!m.worktreeId) return;
    const wt = sharedGit.provider?.getWorktrees().find((w) => w.id === m.worktreeId);
    if (wt) {
      viewSettings!.save({ mode: { type: 'inspection', branch: wt.branch } });
    }
    inspection?.enter(m.worktreeId);
  });
  router.on('recheck-insights', (m) => {
    if (m.worktreeId) inspection?.recheck(m.worktreeId);
  });
  router.on('cancel-insights', () => {
    inspection?.cancel();
  });
  router.on('exit-inspection', () => {
    viewSettings!.save({ mode: { type: 'grove' } });
    inspection?.exit();
  });

  // Miscellaneous handlers
  router.on('set-sort-mode', (m) => {
    if (m.mode) sharedGit.broadcast({ type: 'set-sort-mode', mode: m.mode });
  });

  router.on('webview-error', (m) => {
    log.error(`[Webview/Panel] ${m.error ?? 'Unknown error'}`);
    reportUnexpectedState('webview.panel.errorReport', {
      preview: (m.error ?? '').slice(0, 120),
    });
  });
}
