import React from 'react';
import { useShiftspaceStore } from '../../../store';
import type { ActionConfig } from '../../../types';
import { useActions } from '../../../ui/ActionsContext';
import { IconButton } from '../../../ui/IconButton';

interface ActionBarProps {
  worktreeId: string;
}

function deriveActionType(action: ActionConfig): 'check' | 'service' {
  return action.type ?? (action.persistent ? 'service' : 'check');
}

export const ActionBar: React.FC<ActionBarProps> = React.memo(({ worktreeId }) => {
  const actions = useActions();
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
            <ActionButton key={action.id} action={action} worktreeId={worktreeId} />
          ))}
          {defaultPipelineId && (
            <IconButton
              icon="run-all"
              label="Run all checks"
              onClick={(e) => {
                e.stopPropagation();
                actions.runPipeline(worktreeId, defaultPipelineId);
              }}
              stopPropagation
            />
          )}
        </div>
      )}
      {services.length > 0 && (
        <div className="flex items-center gap-1">
          {services.map((action) => (
            <ActionButton key={action.id} action={action} worktreeId={worktreeId} />
          ))}
        </div>
      )}
    </div>
  );
});
ActionBar.displayName = 'ActionBar';

interface ButtonProps {
  action: ActionConfig;
  worktreeId: string;
}

const ActionButton: React.FC<ButtonProps> = React.memo(({ action, worktreeId }) => {
  const actions = useActions();
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
      actions.stopAction(worktreeId, action.id);
    } else if (!isRunning) {
      actions.runAction(worktreeId, action.id);
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

  const iconName = isRunning && isOneShot ? 'loading' : action.icon;
  const iconAnimation = isRunning && isOneShot ? 'spin 1s linear infinite' : undefined;

  return (
    <IconButton
      icon={iconName}
      label={tooltipText}
      onClick={handleClick}
      iconColor={iconColor}
      iconSize={14}
      iconAnimation={iconAnimation}
      stopPropagation
    />
  );
});
ActionButton.displayName = 'ActionButton';
