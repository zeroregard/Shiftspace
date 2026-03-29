import React from 'react';
import { useShiftspaceStore } from '../store';
import type { InsightSeverity } from '../types';
import { Tooltip } from '../overlays/Tooltip';

interface InsightRowProps {
  worktreeId: string;
}

function getSeverityColor(severity: InsightSeverity): string | undefined {
  switch (severity) {
    case 'none':
      return 'var(--color-text-faint, #666)';
    case 'low':
      return undefined; // default text color
    case 'medium':
      return 'var(--color-status-modified)';
    case 'high':
      return 'var(--color-status-deleted)';
  }
}

const InsightBadge: React.FC<{
  insightId: string;
  worktreeId: string;
}> = React.memo(({ insightId, worktreeId }) => {
  const summary = useShiftspaceStore((s) => s.insightSummaries.get(`${worktreeId}:${insightId}`));
  const config = useShiftspaceStore((s) => s.insightConfigs.find((c) => c.id === insightId));

  if (!summary || !config) return null;

  const color = getSeverityColor(summary.severity);

  return (
    <Tooltip content={summary.label} delayDuration={300}>
      <span className="inline-flex items-center gap-1 text-10" style={{ color }}>
        <i
          className={`codicon codicon-${config.icon}`}
          style={{ fontSize: 11 }}
          aria-hidden="true"
        />
        <span className="font-medium">
          {config.label.slice(0, 3)}: {summary.score}
        </span>
      </span>
    </Tooltip>
  );
});
InsightBadge.displayName = 'InsightBadge';

export const InsightRow: React.FC<InsightRowProps> = React.memo(({ worktreeId }) => {
  const insightConfigs = useShiftspaceStore((s) => s.insightConfigs);
  const enabledConfigs = insightConfigs.filter((c) => c.enabled);

  if (enabledConfigs.length === 0) return null;

  return (
    <div className="flex items-center gap-2 pt-1.5 border-t border-border-dashed">
      {enabledConfigs.map((config) => (
        <InsightBadge key={config.id} insightId={config.id} worktreeId={worktreeId} />
      ))}
    </div>
  );
});
InsightRow.displayName = 'InsightRow';
