import clsx from 'clsx';
import { Codicon } from './icons/codicon';

export interface WorktreeBadgeProps {
  /** Codicon name without the `codicon-` prefix (e.g. 'clock', 'eye'). */
  icon: string;
  label: string;
  /** Hex CSS color for the pill background, e.g. '#7f1d1d'. */
  bgColor: string;
  /** Hex CSS color for the icon + text, e.g. '#fecaca'. */
  fgColor: string;
  className?: string;
}

/**
 * Pill badge attached to a worktree (via `.shiftspace-worktree.json`).
 *
 * Mirrors the sizing / shape of the variant-based `Badge`, but accepts
 * free-form hex colors so agents can tag worktrees with arbitrary states.
 *
 * `shrink-0` + `max-w-[8rem]` ensures the pill stays intact while the
 * neighbouring worktree name ellipsizes instead.
 */
export function WorktreeBadge({ icon, label, bgColor, fgColor, className }: WorktreeBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center gap-1 text-10 font-medium rounded leading-none shrink-0 max-w-[8rem] px-[6px] py-[2px]',
        className
      )}
      style={{ backgroundColor: bgColor, color: fgColor }}
      title={label}
    >
      <Codicon name={icon} size={10} className="leading-none" />
      <span className="truncate leading-none">{label}</span>
    </span>
  );
}
