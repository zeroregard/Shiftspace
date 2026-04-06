const MAX_LOG_BYTES = 1_000_000; // 1MB per log

export class LogStore {
  private logs = new Map<string, string>(); // `${worktreeId}:${actionId}` -> log content

  private key(worktreeId: string, actionId: string): string {
    return `${worktreeId}:${actionId}`;
  }

  append(worktreeId: string, actionId: string, chunk: string): void {
    const k = this.key(worktreeId, actionId);
    const existing = this.logs.get(k) ?? '';
    let combined = existing + chunk;
    // Truncate from start if over limit
    if (combined.length > MAX_LOG_BYTES) {
      combined = combined.slice(combined.length - MAX_LOG_BYTES);
    }
    this.logs.set(k, combined);
  }

  get(worktreeId: string, actionId: string): string {
    return this.logs.get(this.key(worktreeId, actionId)) ?? '';
  }

  clear(worktreeId: string, actionId: string): void {
    this.logs.delete(this.key(worktreeId, actionId));
  }

  clearWorktree(worktreeId: string): void {
    for (const k of Array.from(this.logs.keys())) {
      if (k.startsWith(`${worktreeId}:`)) {
        this.logs.delete(k);
      }
    }
  }
}
