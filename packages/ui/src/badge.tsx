import type { ReactNode } from 'react';
import clsx from 'clsx';

type BadgeVariant = 'error' | 'warning' | 'finding' | 'info' | 'success';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  error: 'text-status-deleted border-status-deleted/30 bg-status-deleted/10',
  warning: 'text-status-modified border-status-modified/30 bg-status-modified/10',
  finding: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
  info: 'text-teal border-teal/30 bg-teal/10',
  success: 'text-status-added border-status-added/30 bg-status-added/10',
};

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * Compact pill badge for status indicators, counts, and labels.
 *
 * Usage:
 *   <Badge variant="error">3 errors</Badge>
 *   <Badge variant="warning"><WarningIcon /> 2</Badge>
 */
export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 text-10 font-medium border px-1 rounded leading-tight',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
