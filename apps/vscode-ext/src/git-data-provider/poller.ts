import * as vscode from 'vscode';
import type { WorktreeState } from '@shiftspace/renderer';
import { gitQueue } from '../git/git-utils';

export interface PollerCallbacks {
  getWorktrees: () => WorktreeState[];
  onWorktreePoll: () => Promise<void> | void;
  onStatusPoll: (wt: WorktreeState) => Promise<void> | void;
}

// Poll every 3 seconds so branch switches (e.g. by agents) are reflected
// quickly. The HEAD watcher is unreliable on some platforms because git
// uses atomic lock-file renames that VSCode's file watcher can miss.
const WORKTREE_POLL_MS = 3_000;

// Poll git status every 2 seconds as a reliable fallback for staging changes.
// VSCode's file watcher does not reliably detect `.git/index` writes on macOS
// (git uses an atomic lock-file rename), so the index watcher alone isn't enough.
const STATUS_POLL_MS = 2_000;

/**
 * Owns the two `setInterval` timers GitDataProvider uses as safety nets for
 * the VSCode file watcher. The status-poll tick skips entirely while a write
 * operation is queued and guards against overlapping cycles with an
 * in-flight flag.
 */
export class Poller implements vscode.Disposable {
  private worktreeTimer: ReturnType<typeof setInterval> | undefined;
  private statusTimer: ReturnType<typeof setInterval> | undefined;
  /** True while a status poll cycle is in progress — prevents overlapping polls. */
  private statusInFlight = false;

  constructor(private readonly cb: PollerCallbacks) {}

  start(): void {
    this.worktreeTimer = setInterval(() => {
      void this.cb.onWorktreePoll();
    }, WORKTREE_POLL_MS);

    this.statusTimer = setInterval(() => {
      if (gitQueue.isActive()) return;
      if (this.statusInFlight) return;
      this.statusInFlight = true;
      // Refresh worktrees sequentially to avoid concurrent git processes.
      void (async () => {
        try {
          for (const wt of this.cb.getWorktrees()) {
            await this.cb.onStatusPoll(wt);
          }
        } finally {
          this.statusInFlight = false;
        }
      })();
    }, STATUS_POLL_MS);
  }

  dispose(): void {
    if (this.worktreeTimer !== undefined) {
      clearInterval(this.worktreeTimer);
      this.worktreeTimer = undefined;
    }
    if (this.statusTimer !== undefined) {
      clearInterval(this.statusTimer);
      this.statusTimer = undefined;
    }
    this.statusInFlight = false;
  }
}
