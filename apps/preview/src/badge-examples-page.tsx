import type { WorktreeBadge } from '@shiftspace/renderer';
import { WorktreeBadge as WorktreeBadgeView } from '@shiftspace/ui/worktree-badge';
import { useTheme } from './use-theme';

interface Example {
  title: string;
  badge: WorktreeBadge;
}

const EXAMPLES: Example[] = [
  { title: 'neutral', badge: { label: 'stale', color: 'neutral' } },
  { title: 'info', badge: { label: 'in progress', color: 'info' } },
  { title: 'success', badge: { label: 'ready', color: 'success' } },
  { title: 'warning', badge: { label: 'in review', color: 'warning' } },
  { title: 'danger', badge: { label: 'blocked', color: 'danger' } },
  { title: 'default (no color)', badge: { label: 'stale' } },
  {
    title: 'long label (truncates)',
    badge: { label: 'waiting on upstream review from platform team', color: 'info' },
  },
];

function Row({ title, badge }: Example) {
  return (
    <div className="flex items-center gap-4 py-1" data-testid={`badge-row-${title}`}>
      <span className="text-text-muted text-11 w-40 shrink-0">— {title} —</span>
      <WorktreeBadgeView label={badge.label} color={badge.color} />
    </div>
  );
}

/**
 * Isolated component harness for the WorktreeBadge. Screenshot tests render
 * this route (`/badge-examples`) so regressions to badge rendering are caught
 * independently of the grove layout.
 */
export function BadgeExamplesPage() {
  useTheme();
  return (
    <div
      className="w-screen min-h-screen bg-canvas p-8 text-text-primary"
      data-testid="badge-examples-root"
    >
      <h1 className="text-13 font-semibold mb-4">WorktreeBadge examples</h1>
      <div className="flex flex-col gap-1">
        {EXAMPLES.map((e) => (
          <Row key={e.title} title={e.title} badge={e.badge} />
        ))}
      </div>
    </div>
  );
}
