import React from 'react';
import clsx from 'clsx';
import type { NodeComponentProps } from '../TreeCanvas';
import type { FileChange } from '../types';
import { DiffPopover } from '../overlays/DiffPopover';
import { ThemedFileIcon } from '../shared/ThemedFileIcon';
import { useInspectionHover } from '../shared/InspectionHoverContext';
import { useFileAnnotations } from '../hooks/useFileAnnotations';
import { StatusDot } from '../ui/StatusDot';
import { Codicon } from '../ui/Codicon';

export interface FileNodeData {
  file: FileChange;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  worktreeId: string;
  [key: string]: unknown;
}

function getChangeTint(file: FileChange): string {
  if (file.status === 'deleted') return 'rgba(224, 92, 92, 0.12)';
  const total = file.linesAdded + file.linesRemoved;
  if (total === 0) return 'transparent';
  const ratio = file.linesAdded / total;
  if (ratio > 0.66) return 'rgba(78, 201, 78, 0.10)';
  if (ratio < 0.33) return 'rgba(224, 92, 92, 0.10)';
  return 'rgba(224, 196, 78, 0.10)';
}

export const FileNode = React.memo(({ data }: NodeComponentProps<FileNodeData>) => {
  const { file, onFileClick, worktreeId } = data;
  const { hoveredFilePath } = useInspectionHover();
  const fileName = file.path.split('/').pop() ?? file.path;
  const isPulsing = Date.now() - file.lastChangedAt < 3000;
  const isDeleted = file.status === 'deleted';
  const isHovered = hoveredFilePath === file.path;

  const { errors, warnings, findings, hasAnnotations } = useFileAnnotations(worktreeId, file.path);

  return (
    <DiffPopover file={file}>
      <div
        className={clsx(
          'w-full h-full border border-border-default rounded-md text-text-secondary transition-[background,opacity,border-color] duration-300',
          isHovered
            ? 'bg-node-file-pulse border-border-staged'
            : isPulsing
              ? 'bg-node-file-pulse'
              : 'bg-node-file'
        )}
        style={{ background: isHovered ? undefined : getChangeTint(file) }}
      >
        <button
          className={clsx(
            'w-full h-full px-2 py-1.5 text-left transition-[background] duration-300',
            onFileClick ? 'cursor-pointer' : 'cursor-default',
            isPulsing ? 'bg-pulse-overlay' : 'bg-transparent'
          )}
          onClick={() => onFileClick?.(worktreeId, file.path)}
        >
          <div className="flex items-center gap-1">
            <span className="shrink-0 flex items-center">
              <ThemedFileIcon filePath={file.path} size={12} />
            </span>
            <span
              className={clsx(
                'text-11 overflow-hidden text-ellipsis whitespace-nowrap',
                isDeleted ? 'text-status-deleted line-through' : 'text-text-primary'
              )}
            >
              {fileName}
            </span>
            <StatusDot status={file.status} />
          </div>
          {hasAnnotations && (
            <div className="mt-1 pt-1 border-border-default/40">
              {errors > 0 && (
                <div className="flex items-center gap-0.5 py-0.5 text-status-deleted">
                  <Codicon name="error" size={16} />
                  <span className="text-11 ml-0.5 mt-px">{errors}</span>
                  <span className="text-11 truncate mt-px">
                    {errors === 1 ? 'error' : 'errors'}
                  </span>
                </div>
              )}
              {warnings > 0 && (
                <div className="flex items-center gap-0.5 py-0.5 text-status-modified">
                  <Codicon name="warning" size={16} />
                  <span className="text-11 ml-0.5 mt-px">{warnings}</span>
                  <span className="text-11 truncate mt-px">
                    {warnings === 1 ? 'warning' : 'warnings'}
                  </span>
                </div>
              )}
              {findings.map((f) => (
                <div key={f.ruleId} className="flex items-center gap-0.5 py-0.5 text-text-muted">
                  <Codicon name="debug-breakpoint-unsupported" size={16} />
                  <span className="text-11 ml-0.5 mt-px">{f.count}</span>
                  <span className="text-11 truncate mt-px">{f.ruleLabel}</span>
                </div>
              ))}
            </div>
          )}
        </button>
      </div>
    </DiffPopover>
  );
});

FileNode.displayName = 'FileNode';
