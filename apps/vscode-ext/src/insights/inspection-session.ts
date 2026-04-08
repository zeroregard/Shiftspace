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

    // Only schedule an insight re-run if the cache was explicitly cleared
    // (by enter/recheck). The status poll fires onFileChange every few seconds
    // even when nothing meaningful changed — without this guard we'd re-send
    // identical findings on every tick.
    if (!this._insightRunner.hasCacheEntry(worktreeId)) {
      if (this._insightDebounceTimer !== undefined) clearTimeout(this._insightDebounceTimer);
      this._insightDebounceTimer = setTimeout(() => {
        this._insightDebounceTimer = undefined;
        void this.runInsights(worktreeId);
      }, 2000);
    }

    if (this._diagnosticDebounceTimer !== undefined) clearTimeout(this._diagnosticDebounceTimer);
    this._diagnosticDebounceTimer = setTimeout(() => {
      this._diagnosticDebounceTimer = undefined;
      const files = this._deps.getWorktreeFiles(worktreeId);
      if (files.length > 0) this._diagnosticCollector.updateFiles(files);
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
    const hadPrevious = !!this._insightAbortController;
    this._insightAbortController?.abort();
    const controller = new AbortController();
    this._insightAbortController = controller;

    const files = this._deps.getWorktreeFiles(worktreeId);
    const smellRules = this._deps.getSmellRules();

    log.info(
      `[insights] runInsights start: ${files.length} files, ${smellRules.length} rules, abortedPrevious=${hadPrevious}`
    );

    // Guard: if the file list is empty, skip — this is almost certainly a
    // transient state (e.g. git ls-files returned empty during a concurrent
    // git operation). Sending an empty detail would wipe existing findings.
    if (files.length === 0) {
      log.info('[insights] runInsights skipped: 0 files (transient)');
      return;
    }

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

      if (controller.signal.aborted) {
        log.info('[insights] runInsights aborted after analysis');
        return;
      }

      let totalFindings = 0;
      for (const detail of details) {
        const count =
          detail.fileInsights?.reduce(
            (sum: number, fi: { findings: unknown[] }) => sum + fi.findings.length,
            0
          ) ?? 0;
        totalFindings += count;
        log.info(
          `[insights] sending detail: ${detail.insightId}, ${detail.fileInsights?.length ?? 0} files, ${count} findings`
        );
        this._deps.postMessage({ type: 'insight-detail', detail });
      }
      log.info(
        `[insights] runInsights done: ${details.length} details, ${totalFindings} total findings`
      );
    } catch (err) {
      if (controller.signal.aborted) {
        log.info('[insights] runInsights aborted in catch');
        return;
      }
      log.error('runInsights error:', err);
    } finally {
      if (!controller.signal.aborted) {
        this._deps.postMessage({ type: 'insights-status', running: false });
      }
    }
  }
}
