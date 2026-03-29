import type { ActionState, CheckState } from './types';

type StateKey = string; // `${worktreeId}:${actionId}`

export class StateManager {
  private states = new Map<StateKey, ActionState>();
  private listeners: Array<(worktreeId: string, actionId: string, state: ActionState) => void> = [];

  private key(worktreeId: string, actionId: string): StateKey {
    return `${worktreeId}:${actionId}`;
  }

  get(worktreeId: string, actionId: string): ActionState | undefined {
    return this.states.get(this.key(worktreeId, actionId));
  }

  set(worktreeId: string, actionId: string, state: ActionState): void {
    this.states.set(this.key(worktreeId, actionId), state);
    this.notify(worktreeId, actionId, state);
  }

  /**
   * Transition all check states for a worktree that are passed/failed → stale.
   * Services are unaffected.
   * Preserves duration/exitCode from previous run.
   */
  markAllStale(worktreeId: string): void {
    for (const [k, state] of this.states.entries()) {
      if (!k.startsWith(`${worktreeId}:`)) continue;
      if (state.type !== 'check') continue;
      const check = state as CheckState;
      if (check.status === 'passed' || check.status === 'failed') {
        const actionId = k.slice(worktreeId.length + 1);
        const staled: CheckState = { ...check, status: 'stale' };
        this.states.set(k, staled);
        this.notify(worktreeId, actionId, staled);
      }
    }
  }

  /** Get all states for a given worktree as a flat map (actionId → state) */
  getWorktreeStates(worktreeId: string): Map<string, ActionState> {
    const result = new Map<string, ActionState>();
    for (const [k, state] of this.states.entries()) {
      if (k.startsWith(`${worktreeId}:`)) {
        const actionId = k.slice(worktreeId.length + 1);
        result.set(actionId, state);
      }
    }
    return result;
  }

  /** Register a listener called whenever any state changes */
  onChange(
    listener: (worktreeId: string, actionId: string, state: ActionState) => void
  ): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(worktreeId: string, actionId: string, state: ActionState): void {
    for (const listener of this.listeners) {
      listener(worktreeId, actionId, state);
    }
  }

  clear(): void {
    this.states.clear();
  }
}
