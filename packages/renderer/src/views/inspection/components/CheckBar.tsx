import React, { useState } from 'react';
import { useShiftspaceStore } from '../../../store';
import type { ActionConfig, ActionStatus } from '../../../types';
import { Tooltip } from '../../../overlays/Tooltip';

interface CheckBarProps {
  worktreeId: string;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onGetLog?: (worktreeId: string, actionId: string) => void;
}

function deriveActionType(action: ActionConfig): 'check' | 'service' {
  return action.type ?? (action.persistent ? 'service' : 'check');
}

function statusIcon(status: ActionStatus, type: 'check' | 'service'): string {
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

function statusColor(status: ActionStatus, type: 'check' | 'service'): string | undefined {
  if ((type === 'service' && status === 'running') || status === 'passed') {
    return 'var(--color-status-added)';
  }
  if (status === 'failed') return 'var(--color-status-deleted)';
  if (status === 'stale') return 'var(--color-status-modified)';
  return undefined;
}

interface CheckChipProps {
  action: ActionConfig;
  worktreeId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onRun?: (worktreeId: string, actionId: string) => void;
  onStop?: (worktreeId: string, actionId: string) => void;
}

const CheckChip: React.FC<CheckChipProps> = React.memo(
  ({ action, worktreeId, expanded, onToggleExpand, onRun, onStop }) => {
    const state = useShiftspaceStore((s) => s.actionStates.get(`${worktreeId}:${action.id}`));
    const type = deriveActionType(action);
    const status: ActionStatus = state?.status ?? (type === 'service' ? 'stopped' : 'idle');
    const isRunning = status === 'running';
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (status === 'unconfigured') return;
      if (isRunning && type === 'service') onStop?.(worktreeId, action.id);
      else if (!isRunning) onRun?.(worktreeId, action.id);
    };

    const color = statusColor(status, type);
    const icon = statusIcon(status, type);

    return (
      <div
        className="flex items-center gap-0.5 px-1.5 py-1 rounded border cursor-pointer transition-colors"
        style={{
          borderColor: expanded ? 'var(--color-border-default)' : 'var(--color-border-dashed)',
          backgroundColor: expanded ? 'var(--color-node-file)' : undefined,
        }}
        onClick={handleClick}
      >
        <i
          className={`codicon codicon-${icon}`}
          style={{
            fontSize: 11,
            color,
            animation: isRunning && type === 'check' ? 'spin 1s linear infinite' : undefined,
          }}
          aria-hidden="true"
        />
        <span className="text-10 text-text-muted ml-0.5">{action.label}</span>

        {/* Expand/collapse log caret */}
        <button
          className="ml-0.5 text-text-faint hover:text-text-muted cursor-pointer bg-transparent border-none p-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-label={expanded ? 'Collapse log' : 'Expand log'}
        >
          <i
            className={`codicon codicon-chevron-${expanded ? 'up' : 'down'}`}
            style={{ fontSize: 9 }}
            aria-hidden="true"
          />
        </button>
      </div>
    );
  }
);
CheckChip.displayName = 'CheckChip';

export const CheckBar: React.FC<CheckBarProps> = React.memo(
  ({ worktreeId, onRunAction, onStopAction, onRunPipeline, onGetLog }) => {
    const actionConfigs = useShiftspaceStore((s) => s.actionConfigs);
    const actionLogs = useShiftspaceStore((s) => s.actionLogs);
    const pipelines = useShiftspaceStore((s) => s.pipelines);
    const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

    const checks = actionConfigs.filter((a) => deriveActionType(a) === 'check');
    const services = actionConfigs.filter((a) => deriveActionType(a) === 'service');

    if (checks.length === 0 && services.length === 0) return null;

    const pipelineIds = Object.keys(pipelines);
    const defaultPipelineId = pipelineIds[0];

    const handleToggleExpand = (actionId: string) => {
      if (expandedActionId === actionId) {
        setExpandedActionId(null);
      } else {
        setExpandedActionId(actionId);
        onGetLog?.(worktreeId, actionId);
      }
    };

    const logContent = expandedActionId
      ? (actionLogs.get(`${worktreeId}:${expandedActionId}`) ?? '')
      : '';

    return (
      <div className="flex flex-col border-b border-border-dashed shrink-0">
        {checks.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 flex-wrap">
            {checks.map((action) => (
              <CheckChip
                key={action.id}
                action={action}
                worktreeId={worktreeId}
                expanded={expandedActionId === action.id}
                onToggleExpand={() => handleToggleExpand(action.id)}
                onRun={onRunAction}
                onStop={onStopAction}
              />
            ))}
            {defaultPipelineId && (
              <Tooltip content="Run all checks" delayDuration={300}>
                <button
                  className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default text-10 cursor-pointer bg-transparent transition-colors"
                  onClick={() => onRunPipeline?.(worktreeId, defaultPipelineId)}
                  aria-label="Run all"
                >
                  <i
                    className="codicon codicon-run-all"
                    style={{ fontSize: 11 }}
                    aria-hidden="true"
                  />
                  <span>Run All</span>
                </button>
              </Tooltip>
            )}
          </div>
        )}

        {checks.length > 0 && services.length > 0 && (
          <div className="border-t border-border-dashed mx-4" />
        )}

        {services.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 flex-wrap">
            <span className="text-10 uppercase tracking-wider text-text-faint w-12 shrink-0">
              Services
            </span>
            {services.map((action) => (
              <CheckChip
                key={action.id}
                action={action}
                worktreeId={worktreeId}
                expanded={expandedActionId === action.id}
                onToggleExpand={() => handleToggleExpand(action.id)}
                onRun={onRunAction}
                onStop={onStopAction}
              />
            ))}
          </div>
        )}

        {/* Expanded log panel */}
        {expandedActionId && (
          <div className="border-t border-border-dashed max-h-48 overflow-y-auto bg-canvas">
            <div className="flex items-center justify-between px-4 py-1 border-b border-border-dashed">
              <span className="text-10 text-text-faint uppercase tracking-wider">
                Log: {actionConfigs.find((a) => a.id === expandedActionId)?.label}
              </span>
              <button
                className="text-10 text-text-faint hover:text-text-muted cursor-pointer bg-transparent border-none"
                onClick={() => setExpandedActionId(null)}
              >
                Close
              </button>
            </div>
            <pre className="px-4 py-2 text-10 text-text-secondary font-mono whitespace-pre-wrap break-all">
              {logContent || '(no output yet)'}
            </pre>
          </div>
        )}
      </div>
    );
  }
);
CheckBar.displayName = 'CheckBar';
