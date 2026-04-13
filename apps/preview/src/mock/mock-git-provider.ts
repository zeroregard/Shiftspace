import type { GitProviderHandlers, DiffMode } from '@shiftspace/renderer';
import { useWorktreeStore } from '@shiftspace/renderer';
import { MOCK_BRANCHES } from './engine';
import type { MockEngine } from './engine';

/**
 * Preview-side counterpart of `GitDataProvider`. Implements the same surface
 * the webview protocol dispatches into (`apps/vscode-ext/src/panel-handlers.ts`
 * via `registerGitProviderHandlers`) but delegates "git work" to `MockEngine`
 * or the Zustand stores directly instead of shelling out to git.
 *
 * Two tenets:
 *  1. **Byte-identical routing** — both hosts register handlers via the same
 *     `registerGitProviderHandlers(router, provider)` call, so any router /
 *     message-shape regression surfaces in preview Playwright tests as well.
 *  2. **Deterministic test hooks** — every mutating flow can be forced to
 *     fail via `failNextOp`. E2E tests assert recovery paths (e.g. the card
 *     unfreezes after `worktree-removal-failed`).
 *
 * Spies: every call goes through `logCall` so tests can inspect what the
 * router delivered via `window.__shiftspaceTest.calls`.
 */
export class MockGitProvider implements GitProviderHandlers {
  private engine: MockEngine;
  /** Flows that should fail the *next* time they run, then reset. */
  private failOnce = new Set<OpName>();
  readonly calls: Array<{ op: string; args: unknown[] }> = [];

  constructor(opts: { engine: MockEngine }) {
    this.engine = opts.engine;
  }

  /**
   * Arm a one-shot failure for a flow. The next invocation of the matching
   * handler takes the failure branch (emitting the failed lifecycle event
   * where applicable), then the arm is cleared.
   */
  failNextOp(op: OpName): void {
    this.failOnce.add(op);
  }

  private shouldFail(op: OpName): boolean {
    if (!this.failOnce.has(op)) return false;
    this.failOnce.delete(op);
    return true;
  }

  private logCall(op: string, args: unknown[]): void {
    this.calls.push({ op, args });
  }

  // file-click / folder-click: preview has no editor — accept the message and
  // log it so tests can assert the protocol reached the provider.
  handleFileClick(worktreeId: string, filePath: string, line?: number): void {
    this.logCall('file-click', [worktreeId, filePath, line]);
  }

  handleFolderClick(worktreeId: string, folderPath: string): void {
    this.logCall('folder-click', [worktreeId, folderPath]);
  }

  handleGetBranchList(worktreeId: string): void {
    this.logCall('get-branch-list', [worktreeId]);
    useWorktreeStore.getState().setBranchList(worktreeId, MOCK_BRANCHES);
  }

  handleCheckoutBranch(worktreeId: string, branch: string): void {
    this.logCall('checkout-branch', [worktreeId, branch]);
    if (this.shouldFail('checkout-branch')) return;
    this.engine.setBranch(worktreeId, branch);
  }

  handleFetchBranches(worktreeId: string): void {
    this.logCall('fetch-branches', [worktreeId]);
    useWorktreeStore.getState().setBranchList(worktreeId, MOCK_BRANCHES);
    useWorktreeStore.getState().setLastFetchAt(worktreeId, Date.now());
  }

  handleSwapBranches(worktreeId: string): void {
    this.logCall('swap-branches', [worktreeId]);
    // Swap is intentionally a no-op in preview — there's no second worktree
    // to swap against. The extension's unit suite
    // (`apps/vscode-ext/tests/unit/swap-branches.test.ts`) covers the real
    // logic.
  }

  handleAddWorktree(): void {
    this.logCall('add-worktree', []);
    if (this.shouldFail('add-worktree')) return;
    this.engine.addPresetWorktree(this.engine.getWorktrees().length);
  }

  handleRemoveWorktree(worktreeId: string): void {
    this.logCall('remove-worktree', [worktreeId]);
    if (this.shouldFail('remove-worktree')) {
      // Mirror the real provider: emit pending, then failed. The store
      // unfreezes the card without deleting the worktree.
      this.engine.publicEmit({ type: 'worktree-removal-pending', worktreeId });
      queueMicrotask(() => {
        this.engine.publicEmit({ type: 'worktree-removal-failed', worktreeId });
      });
      return;
    }
    this.engine.removeWorktree(worktreeId);
  }

  handleRenameWorktree(worktreeId: string, newName: string): void {
    this.logCall('rename-worktree', [worktreeId, newName]);
    if (this.shouldFail('rename-worktree')) return;
    const wt = this.engine.getWorktrees().find((w) => w.id === worktreeId);
    if (!wt) return;
    const parentDir = wt.path.split('/').slice(0, -1).join('/');
    const newPath = parentDir + '/' + newName;
    this.engine.renameWorktree(worktreeId, newPath);
  }

  handleSetDiffMode(worktreeId: string, diffMode: DiffMode): void {
    this.logCall('set-diff-mode', [worktreeId, diffMode]);
    // Real update logic lives in `useSimulationHandlers.handleDiffModeChange`
    // which is still the canonical data source for files in the preview.
  }
}

export type OpName =
  | 'remove-worktree'
  | 'add-worktree'
  | 'rename-worktree'
  | 'checkout-branch'
  | 'swap-branches'
  | 'fetch-branches';
