import React from 'react';
import clsx from 'clsx';
import type { FileChange } from '../types';
import { STATUS_CLASSES } from '../utils/statusClasses';

interface StatusDotProps {
  status: FileChange['status'];
  className?: string;
}

/**
 * Tiny colored dot indicating file status (added/modified/deleted).
 *
 * Usage:
 *   <StatusDot status="added" />
 */
export const StatusDot = React.memo(({ status, className }: StatusDotProps) => (
  <span
    className={clsx('size-2 rounded-full inline-block shrink-0', STATUS_CLASSES[status], className)}
  />
));
StatusDot.displayName = 'StatusDot';
