import { useState, type MouseEvent } from 'react';
import { useActionStore } from '../../../store';
import type { ActionConfig, ActionStatus } from '../../../types';
import { useActions } from '../../../ui/ActionsContext';
import { Codicon } from '../../../ui/Codicon';
import { SectionLabel } from '../../../ui/SectionLabel';
import { Tooltip } from '../../../overlays/Tooltip';
import { deriveActionType, statusIcon, statusColor } from '../../../utils/actionUtils';

interface CheckBarProps {
  worktreeId: string;
}

interface CheckChipProps {
  action: ActionConfig;
  worktreeId: string;
  expanded: boolean;
  onToggleExpand: () => void;
}

function CheckChip({ action, worktreeId, expanded, onToggleExpand }: CheckChipProps) {
  const actions = useActions();
  const state = useActionStore((s) => s.actionStates.get(`${worktreeId}:${action.id}`));
  const type = deriveActionType(action);
  const status: ActionStatus = state?.status ?? (type === 'service' ? 'stopped' : 'idle');
  const isRunning = status === 'running';
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (status === 'unconfigured') return;
    if (isRunning && type === 'service') actions.stopAction(worktreeId, action.id);
    else if (!isRunning) actions.runAction(worktreeId, action.id);
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
      <Codicon
        name={icon}
        size={11}
        color={color}
        animation={isRunning && type === 'check' ? 'spin 1s linear infinite' : undefined}
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
        <Codicon name={expanded ? 'chevron-up' : 'chevron-down'} size={9} />
      </button>
    </div>
  );
}

export function CheckBar({ worktreeId }: CheckBarProps) {
  const actions = useActions();
  const actionConfigs = useActionStore((s) => s.actionConfigs);
  const pipelines = useActionStore((s) => s.pipelines);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  // Only subscribe to the single expanded log entry — avoids re-rendering on
  // every appendActionLog call for other actions.
  const logContent = useActionStore((s) =>
    expandedActionId ? (s.actionLogs.get(`${worktreeId}:${expandedActionId}`) ?? '') : ''
  );

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
      actions.getLog(worktreeId, actionId);
    }
  };

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
            />
          ))}
          {defaultPipelineId && (
            <Tooltip content="Run all checks" delayDuration={300}>
              <button
                className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default text-10 cursor-pointer bg-transparent transition-colors"
                onClick={() => actions.runPipeline(worktreeId, defaultPipelineId)}
                aria-label="Run all"
              >
                <Codicon name="run-all" size={11} />
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
          <SectionLabel className="w-12 shrink-0">Services</SectionLabel>
          {services.map((action) => (
            <CheckChip
              key={action.id}
              action={action}
              worktreeId={worktreeId}
              expanded={expandedActionId === action.id}
              onToggleExpand={() => handleToggleExpand(action.id)}
            />
          ))}
        </div>
      )}

      {/* Expanded log panel */}
      {expandedActionId && (
        <div className="border-t border-border-dashed max-h-48 overflow-y-auto bg-canvas">
          <div className="flex items-center justify-between px-4 py-1 border-b border-border-dashed">
            <SectionLabel>
              Log: {actionConfigs.find((a) => a.id === expandedActionId)?.label}
            </SectionLabel>
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
