import React from 'react';
import { useShiftspaceStore } from '../store';
import type { ActionConfig } from '../types';
import { Tooltip } from './Tooltip';

interface ActionBarProps {
  worktreeId: string;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
}

function deriveActionType(action: ActionConfig): 'check' | 'service' {
  return action.type ?? (action.persistent ? 'service' : 'check');
}

export const ActionBar: React.FC<ActionBarProps> = React.memo(
  ({ worktreeId, onRunAction, onStopAction, onRunPipeline }) => {
    const actionConfigs = useShiftspaceStore((s) => s.actionConfigs);
    const pipelines = useShiftspaceStore((s) => s.pipelines);

    const checks = actionConfigs.filter((a) => deriveActionType(a) === 'check');
    const services = actionConfigs.filter((a) => deriveActionType(a) === 'service');

    if (checks.length === 0 && services.length === 0) return null;

    const defaultPipelineId = Object.keys(pipelines)[0];

    return (
      <div className="flex flex-col gap-1">
        {checks.length > 0 && (
          <div className="flex items-center gap-1">
            {checks.map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                worktreeId={worktreeId}
                onRun={onRunAction}
                onStop={onStopAction}
              />
            ))}
            {defaultPipelineId && onRunPipeline && (
              <Tooltip content="Run all checks" delayDuration={300}>
                <button
                  className="flex items-center justify-center w-6 h-6 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default bg-transparent cursor-pointer transition-colors shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRunPipeline(worktreeId, defaultPipelineId);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Run all checks"
                >
                  <i
                    className="codicon codicon-run-all"
                    style={{ fontSize: 12 }}
                    aria-hidden="true"
                  />
                </button>
              </Tooltip>
            )}
          </div>
        )}
        {services.length > 0 && (
          <div className="flex items-center gap-1">
            {services.map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                worktreeId={worktreeId}
                onRun={onRunAction}
                onStop={onStopAction}
              />
            ))}
          </div>
        )}
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
  const isPassed = status === 'passed';
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
    (isRunning && action.persistent) || isPassed
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
