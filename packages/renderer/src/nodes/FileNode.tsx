import React from 'react';
import clsx from 'clsx';
import type { NodeComponentProps } from '../TreeCanvas';
import type { FileChange, InsightFinding } from '../types';
import { STATUS_CLASSES } from '../utils/statusClasses';
import { DiffPopover } from '../overlays/DiffPopover';
import { ThemedFileIcon } from '../shared/ThemedFileIcon';
import { useInspectionHover } from '../shared/InspectionHoverContext';
import { useShallow } from 'zustand/react/shallow';
import { useShiftspaceStore, getFileFindings } from '../store';

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

  const findings = useShiftspaceStore(
    useShallow((s) => getFileFindings(s.insightDetails, worktreeId, file.path))
  );

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
            <span
              className={clsx(
                'size-2 rounded-full inline-block shrink-0',
                STATUS_CLASSES[file.status]
              )}
            />
          </div>
          {findings.length > 0 && <InsightsList findings={findings} />}
        </button>
      </div>
    </DiffPopover>
  );
});

function InsightsList({ findings }: { findings: InsightFinding[] }) {
  return (
    <div className="mt-1 pt-1 border-border-default/40">
      {findings.map((f) => (
        <div key={f.ruleId} className="flex items-center gap-0.5 py-0.5 text-status-deleted">
          <i
            className="codicon codicon-debug-breakpoint-unsupported shrink-0"
            style={{ fontSize: 16 }}
            aria-hidden="true"
          />
          <span className="text-11 ml-0.5 mt-px">{f.count}</span>
          <span className="text-11 truncate mt-px">{f.ruleLabel}</span>
        </div>
      ))}
    </div>
  );
}

FileNode.displayName = 'FileNode';
