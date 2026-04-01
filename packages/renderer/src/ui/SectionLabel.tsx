import React from 'react';
import clsx from 'clsx';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Uppercase section header used in list panels and action bars.
 *
 * Usage:
 *   <SectionLabel>Staged changes</SectionLabel>
 */
export const SectionLabel = React.memo(({ children, className }: SectionLabelProps) => (
  <span
    className={clsx('text-10 font-semibold uppercase tracking-wider text-text-faint', className)}
  >
    {children}
  </span>
));
SectionLabel.displayName = 'SectionLabel';
