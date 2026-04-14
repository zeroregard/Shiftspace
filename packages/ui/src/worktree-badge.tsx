import clsx from 'clsx';

export type WorktreeBadgeColor = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface WorktreeBadgeProps {
  label: string;
  color?: WorktreeBadgeColor;
  className?: string;
}

const BG_BY_COLOR: Record<WorktreeBadgeColor, string> = {
  neutral: 'bg-cluster',
  info: 'bg-teal',
  success: 'bg-status-added',
  warning: 'bg-status-modified',
  danger: 'bg-status-deleted',
};

/**
 * Pill badge attached to a worktree (via `.shiftspace-worktree.json`).
 *
 * Color is constrained to a semantic set backed by VSCode theme tokens so
 * badges stay legible across themes. Text always uses the primary foreground.
 */
export function WorktreeBadge({ label, color = 'neutral', className }: WorktreeBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center text-11 font-semibold uppercase tracking-wider rounded leading-none shrink-0 max-w-[8rem] px-[6px] py-[3px] text-text-primary',
        BG_BY_COLOR[color],
        className
      )}
      title={label}
    >
      <span className="truncate leading-none">{label}</span>
    </span>
  );
}
