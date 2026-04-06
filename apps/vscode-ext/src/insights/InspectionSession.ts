import type { FileChange } from '@shiftspace/renderer';
import type { InsightRunner } from './runner';
import type { DiagnosticCollector } from './plugins/diagnostics';
import type { SmellRule } from '../actions/types';
import { log } from '../logger';

export interface InspectionDeps {
  postMessage: (msg: object) => void;
  getWorktrees: () => Array<{ id: string; path: string; branch: string }>;
  getWorktreeFiles: (worktreeId: string) => FileChange[];
  getCurrentGitRoot: () => string | undefined;
  getSmellRules: () => SmellRule[];
}

export class InspectionSession {
  private _currentWorktreeId: string | undefined;
  private _insightDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _diagnosticDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _insightAbortController: AbortController | undefined;

  constructor(
    private readonly _insightRunner: InsightRunner,
    private readonly _diagnosticCollector: DiagnosticCollector,
    private readonly _deps: InspectionDeps
  ) {}

  get currentWorktreeId(): string | undefined {
    return this._currentWorktreeId;
  }

  enter(worktreeId: string): void {
    this._currentWorktreeId = worktreeId;
    this._insightRunner.clearCache(worktreeId);
    void this.runInsights(worktreeId);
    const wt = this._deps.getWorktrees().find((w) => w.id === worktreeId);
    if (wt) {
      const files = this._deps.getWorktreeFiles(worktreeId);
      this._diagnosticCollector.startInspection(worktreeId, wt.path, files);
    }
  }

  exit(): void {
    this._currentWorktreeId = undefined;
    this.clearTimers();
    this._insightAbortController?.abort();
    this._insightAbortController = undefined;
    this._diagnosticCollector.stopInspection();
  }

  recheck(worktreeId: string): void {
    // Cancel any pending debounced runs so they don't abort this one
    this.clearTimers();
    this._insightRunner.clearCache(worktreeId);
    void this.runInsights(worktreeId);
    this._diagnosticCollector.recheck();
  }

  /** Called when files change in a worktree. Debounces insight + diagnostic re-analysis. */
  onFileChange(worktreeId: string): void {
    if (this._currentWorktreeId !== worktreeId) return;

    if (this._insightDebounceTimer !== undefined) clearTimeout(this._insightDebounceTimer);
    this._insightDebounceTimer = setTimeout(() => {
      this._insightDebounceTimer = undefined;
      // Don't clearCache here — the runner's content-based cache key will
      // detect whether files actually changed and skip re-analysis if not.
      // Clearing the cache on every FS event caused unnecessary re-runs that
      // raced with each other and produced flickering findings.
      void this.runInsights(worktreeId);
    }, 2000);

    if (this._diagnosticDebounceTimer !== undefined) clearTimeout(this._diagnosticDebounceTimer);
    this._diagnosticDebounceTimer = setTimeout(() => {
      this._diagnosticDebounceTimer = undefined;
      const files = this._deps.getWorktreeFiles(worktreeId);
      this._diagnosticCollector.updateFiles(files);
    }, 300);
  }

  dispose(): void {
    this.clearTimers();
    this._insightAbortController?.abort();
    this._insightAbortController = undefined;
    this._currentWorktreeId = undefined;
  }

  private clearTimers(): void {
    if (this._insightDebounceTimer !== undefined) {
      clearTimeout(this._insightDebounceTimer);
      this._insightDebounceTimer = undefined;
    }
    if (this._diagnosticDebounceTimer !== undefined) {
      clearTimeout(this._diagnosticDebounceTimer);
      this._diagnosticDebounceTimer = undefined;
    }
  }

  private async runInsights(worktreeId: string): Promise<void> {
    const gitRoot = this._deps.getCurrentGitRoot();
    if (!gitRoot) return;

    const wt = this._deps.getWorktrees().find((w) => w.id === worktreeId);
    if (!wt) return;

    // Cancel any in-flight insight run so stale results never overwrite fresh ones
    this._insightAbortController?.abort();
    const controller = new AbortController();
    this._insightAbortController = controller;

    const files = this._deps.getWorktreeFiles(worktreeId);
    const smellRules = this._deps.getSmellRules();

    const extraSettings: Record<string, Record<string, unknown>> = {
      codeSmells: { smellRules },
    };

    this._deps.postMessage({ type: 'insights-status', running: true });

    try {
      const { details } = await this._insightRunner.analyzeWorktree({
        worktreeId,
        files,
        repoRoot: gitRoot,
        worktreeRoot: wt.path,
        signal: controller.signal,
        extraSettings,
      });

      if (controller.signal.aborted) return;

      for (const detail of details) {
        this._deps.postMessage({ type: 'insight-detail', detail });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      log.error('runInsights error:', err);
    } finally {
      if (!controller.signal.aborted) {
        this._deps.postMessage({ type: 'insights-status', running: false });
      }
    }
  }
}
