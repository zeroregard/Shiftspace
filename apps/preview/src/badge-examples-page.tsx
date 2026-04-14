import type { WorktreeBadge } from '@shiftspace/renderer';
import { WorktreeBadge as WorktreeBadgeView } from '@shiftspace/ui/worktree-badge';
import { useTheme } from './use-theme';

interface Example {
  title: string;
  badge: WorktreeBadge;
}

const EXAMPLES: Example[] = [
  {
    title: 'stale',
    badge: { icon: 'clock', label: 'stale', bgColor: '#7f1d1d', fgColor: '#fecaca' },
  },
  {
    title: 'in progress',
    badge: { icon: 'play', label: 'in progress', bgColor: '#1e3a8a', fgColor: '#bfdbfe' },
  },
  {
    title: 'in review',
    badge: { icon: 'eye', label: 'in review', bgColor: '#4a1d7f', fgColor: '#e9d5ff' },
  },
  {
    title: 'blocked',
    badge: { icon: 'error', label: 'blocked', bgColor: '#831843', fgColor: '#fbcfe8' },
  },
  {
    title: 'ready',
    badge: { icon: 'check', label: 'ready', bgColor: '#14532d', fgColor: '#bbf7d0' },
  },
  {
    title: 'custom hue',
    badge: { icon: 'flame', label: 'hot', bgColor: '#7c2d12', fgColor: '#fed7aa' },
  },
  {
    title: 'long label (truncates)',
    badge: {
      icon: 'info',
      label: 'waiting on upstream review from platform team',
      bgColor: '#0c4a6e',
      fgColor: '#bae6fd',
    },
  },
];

function Row({ title, badge }: Example) {
  return (
    <div className="flex items-center gap-4 py-1">
      <span className="text-text-muted text-11 w-40 shrink-0">{title}</span>
      <WorktreeBadgeView
        icon={badge.icon}
        label={badge.label}
        bgColor={badge.bgColor}
        fgColor={badge.fgColor}
      />
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
