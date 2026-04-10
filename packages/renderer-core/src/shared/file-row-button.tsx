import type { MouseEvent } from 'react';
import clsx from 'clsx';
import type { FileChange } from '../types';
import type { FileAnnotations } from '../hooks/use-file-annotations';
import { ThemedFileIcon } from './themed-file-icon';
import { AnnotationBadges } from '../ui/annotation-badges';

interface FileRowButtonProps {
  file: FileChange;
  annotations: FileAnnotations;
  onClick?: (e: MouseEvent) => void;
  onMouseEnter?: (e: MouseEvent) => void;
  onMouseLeave?: (e: MouseEvent) => void;
  /** Called when an annotation badge is clicked, with the 1-indexed line of the first result. */
  onBadgeClick?: (line: number) => void;
  className?: string;
}

export function FileRowButton({
  file,
  annotations,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onBadgeClick,
  className,
}: FileRowButtonProps) {
  const parts = file.path.split('/');
  const fileName = parts.pop() ?? file.path;
  const dirPath = parts.join('/');
  const isDeleted = file.status === 'deleted';

  return (
    <button
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors min-w-16',
        'hover:bg-node-file-pulse',
        onClick ? 'cursor-pointer' : 'cursor-default',
        className
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="shrink-0 flex items-center">
        <ThemedFileIcon filePath={file.path} size={16} />
      </span>

      <span className="text-11 flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
        <span
          className={clsx(
            'shrink-0',
            isDeleted ? 'text-status-deleted line-through' : 'text-text-primary'
          )}
        >
          {fileName}
        </span>
        {dirPath && (
          <span className="text-text-muted overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
            {dirPath}
          </span>
        )}
      </span>

      <AnnotationBadges
        annotations={annotations}
        diffHunks={file.diff}
        onBadgeClick={onBadgeClick}
      />
    </button>
  );
}
