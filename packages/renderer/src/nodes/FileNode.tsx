import React from 'react';
import clsx from 'clsx';
import type { NodeComponentProps } from '../TreeCanvas';
import type { FileChange } from '../types';
import { STATUS_CLASSES } from '../utils/statusClasses';
import { DiffPopover } from '../overlays/DiffPopover';
import { Tooltip } from '../overlays/Tooltip';
import { ThemedFileIcon } from '../shared/ThemedFileIcon';
import { useShallow } from 'zustand/react/shallow';
import { useShiftspaceStore, getFileFindings } from '../store';

export interface FileNodeData {
  file: FileChange;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  worktreeId: string;
  [key: string]: unknown;
}

export const FileNode = React.memo(({ data }: NodeComponentProps<FileNodeData>) => {
  const { file, onFileClick, worktreeId } = data;
  const fileName = file.path.split('/').pop() ?? file.path;
  const isPulsing = Date.now() - file.lastChangedAt < 3000;
  const isDeleted = file.status === 'deleted';

  const findings = useShiftspaceStore(
    useShallow((s) => getFileFindings(s.insightDetails, worktreeId, file.path))
  );
  const totalFindings = findings.length;

  return (
    <DiffPopover file={file}>
      <button
        className={clsx(
          'w-full h-full flex flex-col items-start gap-0.5 px-2 py-1.5 text-left bg-transparent transition-[background] duration-300 rounded-md',
          onFileClick ? 'cursor-pointer' : 'cursor-default',
          isPulsing ? 'bg-node-file-pulse' : 'hover:bg-node-file-pulse'
        )}
        onClick={() => onFileClick?.(worktreeId, file.path)}
      >
        <span className="flex items-center gap-1 w-full">
          <span className="shrink-0 flex items-center">
            <ThemedFileIcon filePath={file.path} size={12} />
          </span>
          <span
            className={clsx(
              'text-11 overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0',
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
        </span>
        {totalFindings > 0 && (
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5">
                {findings.map((f) => (
                  <span key={f.ruleId}>
                    {f.threshold === 1
                      ? `${f.ruleLabel}: ${f.count} found`
                      : `${f.ruleLabel}: 1 found (${f.count} occurrences, threshold: ${f.threshold})`}
                  </span>
                ))}
              </div>
            }
            delayDuration={200}
          >
            <span className="text-10 text-status-modified font-medium px-1 py-0.5 rounded border border-status-modified/30 bg-status-modified/10">
              ⚠ {totalFindings}
            </span>
          </Tooltip>
        )}
      </button>
    </DiffPopover>
  );
});

FileNode.displayName = 'FileNode';
