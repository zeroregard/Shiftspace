import clsx from 'clsx';
import { Tooltip } from './tooltip';

export type WorktreeBadgeColor = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface WorktreeBadgeProps {
  label: string;
  color?: WorktreeBadgeColor;
  /** Optional long-form explanation shown in a hover tooltip. */
  description?: string;
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
 * When `description` is set, hovering the pill reveals it via a Radix tooltip
 * (portals to document.body so it escapes the card bounds).
 */
export function WorktreeBadge({
  label,
  color = 'neutral',
  description,
  className,
}: WorktreeBadgeProps) {
  const pill = (
    <span
      className={clsx(
        'inline-flex items-center justify-center text-11 font-semibold uppercase tracking-wider rounded leading-none shrink-0 max-w-[8rem] px-[6px] py-[3px] text-text-primary',
        BG_BY_COLOR[color],
        className
      )}
      data-testid="worktree-badge"
      // Only fall back to the OS tooltip for label truncation when no richer
      // description is available — avoids a duplicate tooltip stack.
      title={description ? undefined : label}
    >
      <span className="truncate leading-none">{label}</span>
    </span>
  );

  if (!description) return pill;

  return (
    <Tooltip content={<span className="max-w-xs block">{description}</span>} delayDuration={200}>
      {pill}
    </Tooltip>
  );
}
