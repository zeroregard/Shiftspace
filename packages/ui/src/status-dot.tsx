import clsx from 'clsx';

type FileStatus = 'added' | 'modified' | 'deleted';

const STATUS_CLASSES: Record<FileStatus, string> = {
  added: 'bg-status-added',
  modified: 'bg-status-modified',
  deleted: 'bg-status-deleted',
};

interface StatusDotProps {
  status: FileStatus;
  className?: string;
}

/**
 * Tiny colored dot indicating file status (added/modified/deleted).
 *
 * Usage:
 *   <StatusDot status="added" />
 */
export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={clsx(
        'size-2 rounded-full inline-block shrink-0',
        STATUS_CLASSES[status],
        className
      )}
    />
  );
}
