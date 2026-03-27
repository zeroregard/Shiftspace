import React from 'react';
import { useShiftspaceStore } from '../store';
import type { ActionConfig } from '../types';
import { Tooltip } from './Tooltip';

interface ActionBarProps {
  worktreeId: string;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
}

export const ActionBar: React.FC<ActionBarProps> = React.memo(
  ({ worktreeId, onRunAction, onStopAction }) => {
    const actionConfigs = useShiftspaceStore((s) => s.actionConfigs);

    if (actionConfigs.length === 0) return null;

    return (
      <div className="flex items-center gap-1 mb-2 pb-2 border-b border-border-dashed">
        {actionConfigs.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            worktreeId={worktreeId}
            onRun={onRunAction}
            onStop={onStopAction}
          />
        ))}
      </div>
    );
  }
);
ActionBar.displayName = 'ActionBar';

interface ButtonProps {
  action: ActionConfig;
  worktreeId: string;
  onRun?: (worktreeId: string, actionId: string) => void;
  onStop?: (worktreeId: string, actionId: string) => void;
}

const ActionButton: React.FC<ButtonProps> = React.memo(({ action, worktreeId, onRun, onStop }) => {
  const actionState = useShiftspaceStore((s) => s.actionStates.get(`${worktreeId}:${action.id}`));
  const status = actionState?.status ?? 'idle';
  const port = actionState?.port;

  const isRunning = status === 'running';
  const isFailed = status === 'failed';
  const isOneShot = !action.persistent;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning && action.persistent) {
      onStop?.(worktreeId, action.id);
    } else if (!isRunning) {
      onRun?.(worktreeId, action.id);
    }
  };

  const tooltipText = isRunning
    ? port
      ? `${action.label} (running on :${port})`
      : `${action.label} (running)`
    : action.label;

  const iconColor =
    isRunning && action.persistent
      ? 'var(--color-status-added)'
      : isFailed
        ? 'var(--color-status-deleted)'
        : undefined;

  const iconStyle: React.CSSProperties = {
    fontSize: 14,
    color: iconColor,
    animation: isRunning && isOneShot ? 'spin 1s linear infinite' : undefined,
  };

  const iconName = isRunning && isOneShot ? 'loading' : action.icon;

  return (
    <Tooltip content={tooltipText} delayDuration={300}>
      <button
        className="flex items-center justify-center w-6 h-6 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default bg-transparent cursor-pointer transition-colors shrink-0"
        style={isRunning && action.persistent ? { color: iconColor } : undefined}
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={tooltipText}
      >
        <i className={`codicon codicon-${iconName}`} style={iconStyle} aria-hidden="true" />
      </button>
    </Tooltip>
  );
});
ActionButton.displayName = 'ActionButton';
