import React from 'react';
import { useShiftspaceStore } from '../store';
import type { ActionConfig, ActionState, ActionStatus } from '../types';
import { Tooltip } from './Tooltip';

interface CheckRowProps {
  worktreeId: string;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
}

function getCheckIcon(status: ActionStatus, config: ActionConfig): string {
  const type = config.type ?? (config.persistent ? 'service' : 'check');
  if (type === 'service') {
    if (status === 'running') return 'play';
    if (status === 'failed') return 'error';
    return 'play'; // stopped
  }
  // check
  if (status === 'running') return 'loading';
  if (status === 'passed') return 'check';
  if (status === 'failed') return 'error';
  if (status === 'stale') return 'warning';
  if (status === 'unconfigured') return config.icon;
  return 'circle-outline'; // idle
}

function getCheckColor(status: ActionStatus, config: ActionConfig): string | undefined {
  const type = config.type ?? (config.persistent ? 'service' : 'check');
  if (type === 'service' && status === 'running') return 'var(--color-status-added)';
  if (status === 'passed') return 'var(--color-status-added)';
  if (status === 'failed') return 'var(--color-status-deleted)';
  if (status === 'stale') return 'var(--color-status-modified)';
  return undefined;
}

function getTooltipText(
  status: ActionStatus,
  config: ActionConfig,
  state: ActionState | undefined
): string {
  const type = config.type ?? (config.persistent ? 'service' : 'check');
  if (status === 'unconfigured') return `${config.label}: Select a package first`;
  if (type === 'service' && status === 'running' && state?.port) {
    return `${config.label}: running on :${state.port}`;
  }
  if (status === 'running') return `${config.label}: running...`;
  if (status === 'passed') {
    const dur =
      state?.durationMs !== undefined ? ` (${(state.durationMs / 1000).toFixed(1)}s)` : '';
    return `${config.label}: passed${dur}`;
  }
  if (status === 'failed') {
    const dur =
      state?.durationMs !== undefined ? ` (${(state.durationMs / 1000).toFixed(1)}s)` : '';
    return `${config.label}: failed${dur}`;
  }
  if (status === 'stale') return `${config.label}: stale (re-run to refresh)`;
  if (type === 'service' && status === 'stopped') return `${config.label}: stopped`;
  return config.label;
}

const CheckIcon: React.FC<{
  action: ActionConfig;
  worktreeId: string;
  onRun?: (worktreeId: string, actionId: string) => void;
  onStop?: (worktreeId: string, actionId: string) => void;
}> = React.memo(({ action, worktreeId, onRun, onStop }) => {
  const state = useShiftspaceStore((s) => s.actionStates.get(`${worktreeId}:${action.id}`));
  const type = action.type ?? (action.persistent ? 'service' : 'check');
  const status: ActionStatus = state?.status ?? (type === 'service' ? 'stopped' : 'idle');
  const isRunning = status === 'running';
  const isUnconfigured = status === 'unconfigured';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnconfigured) return;
    if (isRunning && type === 'service') {
      onStop?.(worktreeId, action.id);
    } else if (!isRunning) {
      onRun?.(worktreeId, action.id);
    }
  };

  const iconName = getCheckIcon(status, action);
  const color = getCheckColor(status, action);
  const tooltip = getTooltipText(status, action, state);

  return (
    <Tooltip content={tooltip} delayDuration={300}>
      <button
        className="flex flex-col items-center gap-0.5 min-w-[28px] cursor-pointer bg-transparent border-none p-0.5 rounded hover:bg-node-file-pulse disabled:cursor-default"
        style={{ opacity: isUnconfigured ? 0.4 : 1 }}
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={isUnconfigured}
        aria-label={tooltip}
      >
        <i
          className={`codicon codicon-${iconName}`}
          style={{
            fontSize: 12,
            color,
            animation: isRunning && type === 'check' ? 'spin 1s linear infinite' : undefined,
          }}
          aria-hidden="true"
        />
        <span className="text-10 text-text-faint leading-none truncate max-w-[32px]">
          {action.label.slice(0, 4)}
        </span>
      </button>
    </Tooltip>
  );
});
CheckIcon.displayName = 'CheckIcon';

export const CheckRow: React.FC<CheckRowProps> = React.memo(
  ({ worktreeId, onRunAction, onStopAction, onRunPipeline }) => {
    const actionConfigs = useShiftspaceStore((s) => s.actionConfigs);
    const pipelines = useShiftspaceStore((s) => s.pipelines);

    if (actionConfigs.length === 0) return null;

    const pipelineIds = Object.keys(pipelines);
    const defaultPipelineId = pipelineIds[0];

    return (
      <div
        className="flex items-center gap-1 pt-2 border-t border-border-dashed"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5 flex-wrap flex-1">
          {actionConfigs.map((action) => (
            <CheckIcon
              key={action.id}
              action={action}
              worktreeId={worktreeId}
              onRun={onRunAction}
              onStop={onStopAction}
            />
          ))}
        </div>
        {defaultPipelineId && (
          <Tooltip content="Run all checks" delayDuration={300}>
            <button
              className="flex items-center justify-center w-5 h-5 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default bg-transparent cursor-pointer transition-colors shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onRunPipeline?.(worktreeId, defaultPipelineId);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Run all checks"
            >
              <i className="codicon codicon-run-all" style={{ fontSize: 10 }} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
    );
  }
);
CheckRow.displayName = 'CheckRow';
