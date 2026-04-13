import {
  MessageRouter,
  registerGitProviderHandlers,
  type WebviewMessage,
} from '@shiftspace/renderer';
import type { MockGitProvider, OpName } from './mock-git-provider';

/**
 * Drives the preview's webview message protocol end-to-end.
 *
 * Renderer callbacks (→ `postMessage`) → router → `MockGitProvider` handler.
 * Mirrors the shape of `apps/vscode-ext/src/panel-handlers.ts` so any routing
 * regression surfaces in the preview E2E suite.
 *
 * Exposes `window.__shiftspaceTest` for Playwright — tests arm one-shot
 * failures and inspect the call log without reaching into React state.
 */
export class MockWebviewBridge {
  readonly router = new MessageRouter();
  readonly provider: MockGitProvider;
  readonly posted: WebviewMessage[] = [];

  constructor(provider: MockGitProvider) {
    this.provider = provider;
    registerGitProviderHandlers(this.router, provider);
    // Parity with extension: set-diff-mode is registered separately
    // (the extension persists view-settings first, but the preview has no
    // such concept — passthrough is enough).
    this.router.on('set-diff-mode', (m) => {
      if (!m.worktreeId || !m.diffMode) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DiffMode is runtime-validated elsewhere
      provider.handleSetDiffMode(m.worktreeId, m.diffMode as any);
    });
  }

  /** Called by the renderer via `onRemoveWorktree` etc. */
  postMessage(msg: WebviewMessage): void {
    this.posted.push(msg);
    this.router.dispatch(msg);
  }

  /**
   * Install the Playwright-visible hook. Kept in `src` (not under a test-only
   * path) so it's available in the dev server without extra bundling — gated
   * on a flag so production-like builds don't expose it.
   */
  installTestHook(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis hook, intentionally loose
    (globalThis as any).__shiftspaceTest = {
      failNextOp: (op: OpName) => this.provider.failNextOp(op),
      getCalls: () => this.provider.calls.slice(),
      getPostedMessages: () => this.posted.slice(),
      clearCalls: () => {
        this.provider.calls.length = 0;
        this.posted.length = 0;
      },
    };
  }
}
