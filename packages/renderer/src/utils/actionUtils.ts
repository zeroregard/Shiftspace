import type { ActionConfig, ActionStatus } from '../types';

/** Derive whether an action is a check or service based on config. */
export function deriveActionType(action: ActionConfig): 'check' | 'service' {
  return action.type ?? (action.persistent ? 'service' : 'check');
}

/** Map an action status to its codicon name. */
export function statusIcon(status: ActionStatus, type: 'check' | 'service'): string {
  if (type === 'service') {
    if (status === 'running') return 'play';
    if (status === 'failed') return 'error';
    return 'play';
  }
  if (status === 'running') return 'loading';
  if (status === 'passed') return 'check';
  if (status === 'failed') return 'error';
  if (status === 'stale') return 'warning';
  if (status === 'unconfigured') return 'circle-outline';
  return 'circle-outline';
}

/** Map an action status to its CSS color variable. */
export function statusColor(status: ActionStatus, type: 'check' | 'service'): string | undefined {
  if ((type === 'service' && status === 'running') || status === 'passed') {
    return 'var(--color-status-added)';
  }
  if (status === 'failed') return 'var(--color-status-deleted)';
  if (status === 'stale') return 'var(--color-status-modified)';
  return undefined;
}
