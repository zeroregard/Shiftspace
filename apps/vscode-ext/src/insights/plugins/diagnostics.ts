import * as vscode from 'vscode';
import * as path from 'path';
import type { FileChange, FileDiagnosticSummary } from '@shiftspace/renderer';

const MAX_DETAILS_PER_FILE = 50;

function severityToString(
  severity: vscode.DiagnosticSeverity
): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'info';
    default:
      return 'hint';
  }
}

/**
 * Collect VSCode diagnostics (from all language servers) for the given changed files.
 */
export function collectDiagnostics(
  changedFiles: FileChange[],
  worktreeRoot: string
): FileDiagnosticSummary[] {
  const results: FileDiagnosticSummary[] = [];

  for (const file of changedFiles) {
    const absolutePath = path.join(worktreeRoot, file.path);
    const uri = vscode.Uri.file(absolutePath);
    const diagnostics = vscode.languages.getDiagnostics(uri);

    if (diagnostics.length === 0) continue;

    let errors = 0;
    let warnings = 0;
    let info = 0;
    let hints = 0;
    const details: FileDiagnosticSummary['details'] = [];

    for (const d of diagnostics) {
      const severity = severityToString(d.severity);

      if (severity === 'error') errors++;
      else if (severity === 'warning') warnings++;
      else if (severity === 'info') info++;
      else hints++;

      if (details.length < MAX_DETAILS_PER_FILE) {
        details.push({
          severity,
          message: d.message,
          source: d.source ?? 'unknown',
          line: d.range.start.line + 1, // 1-indexed for display
        });
      }
    }

    results.push({ filePath: file.path, errors, warnings, info, hints, details });
  }

  return results;
}

/**
 * Manages diagnostic collection and change-listening for a Shiftspace panel.
 * This runs in the extension host (not webview) because it needs `vscode.languages`.
 */
export class DiagnosticCollector {
  private _disposable: vscode.Disposable | undefined;
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _currentWorktreeId: string | undefined;
  private _currentWorktreeRoot: string | undefined;
  private _currentFiles: FileChange[] = [];
  private _postMessage: (msg: object) => void;

  constructor(postMessage: (msg: object) => void) {
    this._postMessage = postMessage;

    this._disposable = vscode.languages.onDidChangeDiagnostics((e) => {
      if (!this._currentWorktreeId || !this._currentWorktreeRoot) return;
      if (!this.isEnabled()) return;

      // Check if any changed URIs are in our file list
      const worktreeRoot = this._currentWorktreeRoot;
      const relevant = e.uris.some((uri) => {
        const filePath = uri.fsPath;
        return this._currentFiles.some((f) => path.join(worktreeRoot, f.path) === filePath);
      });

      if (!relevant) return;

      // Debounce — diagnostics can fire rapidly
      if (this._debounceTimer !== undefined) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = undefined;
        this.sendDiagnostics();
      }, 500);
    });
  }

  isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('shiftspace');
    return config.get<boolean>('insights.diagnostics.enabled') ?? true;
  }

  /**
   * Start collecting diagnostics for a worktree (called on enter-inspection).
   */
  startInspection(worktreeId: string, worktreeRoot: string, files: FileChange[]): void {
    this._currentWorktreeId = worktreeId;
    this._currentWorktreeRoot = worktreeRoot;
    this._currentFiles = files;

    if (!this.isEnabled()) return;
    this.sendDiagnostics();
  }

  /**
   * Update the file list (e.g. when files change while inspecting).
   */
  updateFiles(files: FileChange[]): void {
    this._currentFiles = files;
    if (!this._currentWorktreeId || !this.isEnabled()) return;
    this.sendDiagnostics();
  }

  /**
   * Re-collect and send diagnostics for the current inspection (called on recheck).
   */
  recheck(): void {
    if (!this._currentWorktreeId || !this.isEnabled()) return;
    this.sendDiagnostics();
  }

  /**
   * Stop collecting (called on exit-inspection).
   */
  stopInspection(): void {
    this._currentWorktreeId = undefined;
    this._currentWorktreeRoot = undefined;
    this._currentFiles = [];
    if (this._debounceTimer !== undefined) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = undefined;
    }
  }

  private sendDiagnostics(): void {
    if (!this._currentWorktreeId || !this._currentWorktreeRoot) return;

    const summaries = collectDiagnostics(this._currentFiles, this._currentWorktreeRoot);
    this._postMessage({
      type: 'diagnostics-update',
      worktreeId: this._currentWorktreeId,
      files: summaries,
    });
  }

  dispose(): void {
    this._disposable?.dispose();
    this._disposable = undefined;
    if (this._debounceTimer !== undefined) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = undefined;
    }
  }
}
