import React from 'react';
import clsx from 'clsx';

interface SpinnerProps {
  /** Codicon to spin (default: "loading") */
  icon?: string;
  /** Font-size in px (default: 11) */
  size?: number;
  /** Override color */
  color?: string;
  className?: string;
}

/**
 * Animated loading spinner using a rotating codicon.
 *
 * Usage:
 *   <Spinner />
 *   <Spinner icon="sync" size={14} color="var(--color-status-added)" />
 */
export const Spinner = React.memo(({ icon = 'loading', size = 11, color, className }: SpinnerProps) => (
  <i
    className={clsx(`codicon codicon-${icon}`, className)}
    style={{ fontSize: size, color, animation: 'spin 1s linear infinite' }}
    aria-hidden="true"
  />
));
Spinner.displayName = 'Spinner';
