import clsx from 'clsx';

interface CodiconProps {
  /** Icon name without the `codicon-` prefix */
  name: string;
  /** Font-size in px (default: 12) */
  size?: number;
  /** Override color */
  color?: string;
  /** CSS animation string */
  animation?: string;
  className?: string;
}

/**
 * Renders a VSCode Codicon glyph. Requires codicon.css to be loaded by the host.
 *
 * Usage:
 *   <Codicon name="git-branch" />
 *   <Codicon name="error" size={16} color="var(--color-status-deleted)" />
 */
export function Codicon({ name, size = 12, color, animation, className }: CodiconProps) {
  return (
    <i
      className={clsx(`codicon codicon-${name}`, className)}
      style={{ fontSize: size, color, animation }}
      aria-hidden="true"
    />
  );
}
