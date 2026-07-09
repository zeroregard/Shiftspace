import * as vscode from 'vscode';
import type { WorktreeState, PrStatus } from '@shiftspace/renderer';
import { log } from '../logger';
import { getRemoteUrl, gitQueue } from '../git/git-utils';
import { getGitHubTokenSilent } from '../github/auth';
import { GitHubClient, isRateLimited, GitHubApiError } from '../github/client';
import { parseGitHubRemote } from '../github/remote';

export interface PrStatusPollerCallbacks {
  getWorktrees: () => WorktreeState[];
  onPrStatus: (worktreeId: string, next: PrStatus | undefined) => void;
}

const DEFAULT_POLL_SECONDS = 45;
const MIN_POLL_SECONDS = 15;
const RATE_LIMIT_FALLBACK_MS = 5 * 60_000;

/** Shallow compare two PrStatus values (ignoring fetchedAt) to suppress no-op emits. */
export function prStatusEqual(a: PrStatus | undefined, b: PrStatus | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.number === b.number &&
    a.url === b.url &&
    a.conflicts === b.conflicts &&
    a.approved === b.approved &&
    a.unresolvedComments === b.unresolvedComments &&
    a.ciStatus === b.ciStatus
  );
}

function readConfig(): { enabled: boolean; pollMs: number } {
  const cfg = vscode.workspace.getConfiguration('shiftspace');
  const enabled = cfg.get<boolean>('pr.enabled', false);
  const seconds = cfg.get<number>('pr.pollIntervalSeconds', DEFAULT_POLL_SECONDS);
  return { enabled, pollMs: Math.max(MIN_POLL_SECONDS, seconds) * 1000 };
}

/**
 * Polls the GitHub API for PR status per worktree branch on a slow, configurable
 * interval. Modeled on `Poller`: single timer, in-flight guard, skips while a
 * git write is queued. Additionally: silent-auth gated (no session → no-op),
 * per-worktree remote → PR resolution, and rate-limit backoff.
 *
 * Owns its own config- and auth-change subscriptions and restarts itself when
 * the relevant settings or the GitHub session change.
 */
export class PrStatusPoller implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;
  private backoffUntil = 0;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly cb: PrStatusPollerCallbacks) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('shiftspace.pr')) this.restart();
      }),
      vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id === 'github') this.restart();
      })
    );
  }

  start(): void {
    const { enabled, pollMs } = readConfig();
    if (!enabled) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), pollMs);
  }

  private restart(): void {
    this.stopTimer();
    this.start();
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    if (Date.now() < this.backoffUntil) return;
    if (gitQueue.isActive()) return;
    const token = await getGitHubTokenSilent();
    if (!token) return; // no session → silent no-op

    this.inFlight = true;
    try {
      const client = new GitHubClient(token);
      for (const wt of this.cb.getWorktrees()) {
        try {
          const url = await getRemoteUrl(wt.path);
          const ref = url ? parseGitHubRemote(url) : null;
          if (!ref) continue; // non-GitHub remote → skip
          const next = (await client.fetchPrStatus(ref, wt.branch)) ?? undefined;
          this.cb.onPrStatus(wt.id, next);
        } catch (err) {
          if (isRateLimited(err)) {
            this.applyBackoff(err);
            break; // stop the cycle — subsequent calls would fail too
          }
          log.warn(`[pr-status] failed for ${wt.branch}: ${String(err)}`);
        }
      }
    } finally {
      this.inFlight = false;
    }
  }

  private applyBackoff(err: unknown): void {
    const resetMs = err instanceof GitHubApiError ? err.rateLimitResetMs : undefined;
    this.backoffUntil = resetMs ?? Date.now() + RATE_LIMIT_FALLBACK_MS;
    log.warn(
      `[pr-status] rate limited — backing off until ${new Date(this.backoffUntil).toISOString()}`
    );
  }

  /** Stop the poll timer but keep config/auth subscriptions alive (survives repo switches). */
  stop(): void {
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.inFlight = false;
  }

  dispose(): void {
    this.stopTimer();
    for (const s of this.subscriptions) s.dispose();
    this.subscriptions.length = 0;
  }
}
