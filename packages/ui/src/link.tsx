import type { MouseEvent, ReactNode } from 'react';
import clsx from 'clsx';

interface LinkProps {
  children: ReactNode;
  onClick?: (e: MouseEvent) => void;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * Bare clickable text — no border, no padding, no chrome.
 * Semantic segue toward a future router `<Link>`.
 *
 * Usage:
 *   <Link onClick={() => navigate(id)}>Project name</Link>
 */
export function Link({
  children,
  onClick,
  className,
  disabled = false,
  'data-testid': dataTestId,
}: LinkProps) {
  return (
    <button
      className={clsx(
        'bg-transparent border-none p-0 cursor-pointer text-left transition-colors',
        disabled && 'opacity-40 pointer-events-none',
        className
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
    >
      {children}
    </button>
  );
}
