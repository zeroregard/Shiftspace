import type { ReactNode } from 'react';
import clsx from 'clsx';

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Uppercase section header used in list panels and action bars.
 *
 * Usage:
 *   <SectionLabel>Staged changes</SectionLabel>
 */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <span
      className={clsx('text-11 font-semibold uppercase tracking-wider text-text-faint', className)}
    >
      {children}
    </span>
  );
}
