/**
 * Transport-agnostic router for webview ↔ host messages.
 *
 * Both the VSCode extension host and the preview app's mock bridge register
 * handlers here. Callers dispatch({ type, ...payload }) and the registered
 * handler (if any) is invoked synchronously. Handler bodies typically
 * fire-and-forget async work with `void provider.handle...()`.
 */
export interface WebviewMessage {
  type: string;
  worktreeId?: string;
  filePath?: string;
  diffMode?: unknown;
  branch?: string;
  folderPath?: string;
  actionId?: string;
  pipelineId?: string;
  packageName?: string;
  newName?: string;
  /** 1-indexed line number for jump-to-line on file-click. */
  line?: number;
  /** Sort mode (used by set-sort-mode). */
  mode?: string;
  /** Error details forwarded from the webview (used by webview-error). */
  error?: string;
}

type Handler = (msg: WebviewMessage) => void;

export class MessageRouter {
  private _handlers = new Map<string, Handler>();

  on(type: string, handler: Handler): void {
    this._handlers.set(type, handler);
  }

  clear(): void {
    this._handlers.clear();
  }

  dispatch(message: WebviewMessage): void {
    this._handlers.get(message.type)?.(message);
  }
}
