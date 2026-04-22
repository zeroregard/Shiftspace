/**
 * Transport-agnostic router for webview → host messages.
 *
 * Messages are modeled as a discriminated union keyed on `type`. Each variant
 * carries exactly the payload its handler needs, so once a message is routed
 * TypeScript has already checked that every required field is present and
 * typed correctly. A typo in a field name at a call site becomes a compile
 * error instead of a silent `undefined` at runtime.
 *
 * Both the VSCode extension host and the preview app's mock bridge register
 * handlers here. Callers dispatch a typed `WebviewMessage` and the registered
 * handler (if any) is invoked synchronously. Handler bodies typically
 * fire-and-forget async work with `void provider.handle...()`.
 */

import type { DiffMode, WorktreeSortMode } from '../types';

/**
 * Every message the webview can send to the host, as a discriminated union.
 *
 * Adding a new message:
 *  1. Add a variant here.
 *  2. Register its handler on a `MessageRouter` — the callback parameter is
 *     automatically narrowed to that variant.
 */
export type WebviewMessage =
  // Lifecycle
  | { type: 'ready' }
  | { type: 'webview-error'; error: string }
  // File / folder interaction
  | { type: 'file-click'; worktreeId: string; filePath: string; line?: number }
  | { type: 'folder-click'; worktreeId: string; folderPath: string }
  // Plan document preview (async round trip → host replies with `plan-content`)
  | { type: 'load-plan-content'; worktreeId: string }
  // Worktree lifecycle
  | { type: 'add-worktree' }
  | { type: 'remove-worktree'; worktreeId: string }
  | { type: 'rename-worktree'; worktreeId: string; newName: string }
  | { type: 'worktree-click'; worktreeId: string }
  // Branch management
  | { type: 'get-branch-list'; worktreeId: string }
  | { type: 'checkout-branch'; worktreeId: string; branch: string }
  | { type: 'fetch-branches'; worktreeId: string }
  | { type: 'swap-branches'; worktreeId: string }
  | { type: 'set-diff-mode'; worktreeId: string; diffMode: DiffMode }
  // Actions / pipelines
  | { type: 'run-action'; worktreeId: string; actionId: string }
  | { type: 'stop-action'; worktreeId: string; actionId: string }
  | { type: 'run-pipeline'; worktreeId: string; pipelineId: string }
  | { type: 'cancel-pipeline'; worktreeId: string }
  | { type: 'get-log'; worktreeId: string; actionId: string }
  // Packages
  | { type: 'set-package'; packageName: string }
  | { type: 'detect-packages' }
  // Inspection
  | { type: 'enter-inspection'; worktreeId: string }
  | { type: 'exit-inspection' }
  | { type: 'recheck-insights'; worktreeId: string }
  | { type: 'cancel-insights' }
  // Misc
  | { type: 'set-sort-mode'; mode: WorktreeSortMode };

/** Valid message type discriminants (keys of the union). */
export type WebviewMessageType = WebviewMessage['type'];

/** Narrow the union to the single variant whose `type` matches `T`. */
export type MessageOfType<T extends WebviewMessageType> = Extract<WebviewMessage, { type: T }>;

/** Handler signature for a specific message type — parameter is fully narrowed. */
export type MessageHandler<T extends WebviewMessageType> = (msg: MessageOfType<T>) => void;

/** Internal-only handler shape: heterogeneous by key, narrowed on dispatch. */
type AnyMessageHandler = (msg: WebviewMessage) => void;

export class MessageRouter {
  private _handlers = new Map<WebviewMessageType, AnyMessageHandler>();

  on<T extends WebviewMessageType>(type: T, handler: MessageHandler<T>): void {
    // Storage is keyed by type, so the handler only ever sees messages of
    // the matching variant. TS can't prove the invariant across Map<>, so
    // we erase the generic via unknown on the way in.
    this._handlers.set(type, handler as unknown as AnyMessageHandler);
  }

  clear(): void {
    this._handlers.clear();
  }

  /**
   * Route `message` to its registered handler (if any). Unknown `type`
   * values — e.g. a malformed message from the webview — are silently
   * dropped; that's the same behavior the untyped router had.
   */
  dispatch(message: WebviewMessage): void {
    const handler = this._handlers.get(message.type);
    if (handler) handler(message);
  }
}
