import type { MouseEvent } from 'react';
import clsx from 'clsx';
import { Tooltip } from '../overlays/Tooltip';

type IconButtonSize = 'sm' | 'md';

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
};

interface IconButtonProps {
  /** Codicon name without the `codicon-` prefix, e.g. "trash", "edit", "refresh" */
  icon: string;
  /** Accessible label and tooltip text */
  label: string;
  onClick?: (e: MouseEvent) => void;
  size?: IconButtonSize;
  /** Show tooltip on hover (default: true) */
  tooltip?: boolean;
  /** Override icon color via CSS variable or hex */
  iconColor?: string;
  /** Override icon font-size in px */
  iconSize?: number;
  /** CSS animation string, e.g. 'spin 1s linear infinite' */
  iconAnimation?: string;
  /** Renders as ghost (no border) until hovered */
  ghost?: boolean;
  /** Only show on parent group-hover */
  groupVisible?: boolean;
  /** Danger state — hover turns red */
  danger?: boolean;
  className?: string;
  disabled?: boolean;
  /** Stop pointer-down propagation (useful in draggable containers) */
  stopPropagation?: boolean;
}

/**
 * Consistent icon button used throughout the app for actions.
 *
 * Usage:
 *   <IconButton icon="trash" label="Remove worktree" onClick={handleRemove} danger />
 *   <IconButton icon="edit" label="Rename" size="sm" ghost groupVisible />
 */
export function IconButton({
  icon,
  label,
  onClick,
  size = 'md',
  tooltip = true,
  iconColor,
  iconSize,
  iconAnimation,
  ghost = false,
  groupVisible = false,
  danger = false,
  className,
  disabled = false,
  stopPropagation = false,
}: IconButtonProps) {
  const btn = (
    <button
      className={clsx(
        'flex items-center justify-center rounded bg-transparent cursor-pointer transition-colors shrink-0',
        SIZE_CLASSES[size],
        ghost
          ? 'border border-transparent text-text-muted hover:text-text-primary hover:border-border-dashed'
          : 'border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default',
        danger && 'hover:text-status-deleted',
        groupVisible && 'opacity-0 group-hover:opacity-100 transition-opacity',
        disabled && 'opacity-40 pointer-events-none',
        className
      )}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onClick?.(e);
      }}
      onPointerDown={stopPropagation ? (e) => e.stopPropagation() : undefined}
      aria-label={label}
      disabled={disabled}
    >
      <i
        className={`codicon codicon-${icon}`}
        style={{
          fontSize: iconSize ?? (size === 'sm' ? 11 : 12),
          color: iconColor,
          animation: iconAnimation,
        }}
        aria-hidden="true"
      />
    </button>
  );

  if (!tooltip) return btn;

  return (
    <Tooltip content={label} delayDuration={300}>
      {btn}
    </Tooltip>
  );
}
