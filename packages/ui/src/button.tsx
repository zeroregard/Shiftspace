import type { MouseEvent, ReactNode } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-teal/90 text-white border-teal/50 hover:bg-teal hover:border-teal',
  ghost:
    'bg-transparent text-text-muted border-border-dashed hover:text-text-primary hover:border-border-default',
  danger:
    'bg-transparent text-text-muted border-border-dashed hover:text-status-deleted hover:border-status-deleted/50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-10 py-0.5 px-1.5 gap-1',
  md: 'text-11 py-1 px-2 gap-1.5',
};

interface ButtonProps {
  children: ReactNode;
  onClick?: (e: MouseEvent) => void;
  /** Visual variant (default: "ghost") */
  variant?: ButtonVariant;
  /** Size (default: "md") */
  size?: ButtonSize;
  /** Optional leading codicon name (without `codicon-` prefix) */
  icon?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Text button with optional leading icon.
 *
 * Usage:
 *   <Button variant="primary" icon="add" onClick={handleAdd}>New worktree</Button>
 *   <Button variant="danger" icon="trash">Delete</Button>
 *   <Button>Cancel</Button>
 */
export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  icon,
  disabled = false,
  className,
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded border font-medium cursor-pointer transition-colors shrink-0',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        disabled && 'opacity-40 pointer-events-none',
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && (
        <i
          className={`codicon codicon-${icon}`}
          style={{ fontSize: size === 'sm' ? 11 : 12 }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
