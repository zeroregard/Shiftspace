import React from 'react';
import clsx from 'clsx';
import { useDragPan } from '../../../hooks/useDragPan';
import type { WorktreeState, FileChange } from '../../../types';
import { DiffPopover } from '../../../overlays/DiffPopover';
import { Tooltip } from '../../../overlays/Tooltip';
import { ThemedFileIcon } from '../../../shared/ThemedFileIcon';
import { WorktreeHeader } from '../../../nodes/WorktreeHeader';
import { partitionFiles } from '../../../utils/listSections';
import { useShiftspaceStore, getFileFindings } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { Badge } from '../../../ui/Badge';
import { Codicon } from '../../../ui/Codicon';
import { SectionLabel } from '../../../ui/SectionLabel';

const STATUS_LETTER: Record<FileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
};

const STATUS_COLOR_CLASS: Record<FileChange['status'], string> = {
  added: 'text-status-added',
  modified: 'text-status-modified',
  deleted: 'text-status-deleted',
};

interface ListFileRowProps {
  file: FileChange;
  worktreeId: string;
  onFileClick?: (worktreeId: string, filePath: string) => void;
}

const ListFileRow = React.memo(({ file, worktreeId, onFileClick }: ListFileRowProps) => {
  const parts = file.path.split('/');
  const fileName = parts.pop() ?? file.path;
  const dirPath = parts.join('/');
  const isDeleted = file.status === 'deleted';

  const diagnostics = useShiftspaceStore((s) =>
    s.fileDiagnostics.get(`${worktreeId}:${file.path}`)
  );
  const errors = diagnostics?.errors ?? 0;
  const warnings = diagnostics?.warnings ?? 0;

  const findings = useShiftspaceStore(
    useShallow((s) => getFileFindings(s.insightDetails, worktreeId, file.path))
  );
  const totalFindings = findings.length;

  return (
    <DiffPopover file={file}>
      <button
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors',
          'hover:bg-node-file-pulse',
          onFileClick ? 'cursor-pointer' : 'cursor-default'
        )}
        onClick={() => onFileClick?.(worktreeId, file.path)}
      >
        {/* File icon */}
        <span className="shrink-0 flex items-center">
          <ThemedFileIcon filePath={file.path} size={16} />
        </span>

        {/* Filename + directory */}
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

        {/* Insight pills */}
        {(errors > 0 || warnings > 0 || totalFindings > 0) && (
          <span className="shrink-0 flex items-center gap-1">
            {errors > 0 && (
              <Tooltip
                content={
                  <div className="flex flex-col gap-0.5">
                    {diagnostics!.details
                      .filter((d) => d.severity === 'error')
                      .map((d, i) => (
                        <span key={i}>
                          L{d.line}: {d.message} ({d.source})
                        </span>
                      ))}
                  </div>
                }
                delayDuration={200}
              >
                <Badge variant="error">
                  <Codicon name="error" size={10} /> {errors}
                </Badge>
              </Tooltip>
            )}
            {warnings > 0 && (
              <Tooltip
                content={
                  <div className="flex flex-col gap-0.5">
                    {diagnostics!.details
                      .filter((d) => d.severity === 'warning')
                      .map((d, i) => (
                        <span key={i}>
                          L{d.line}: {d.message} ({d.source})
                        </span>
                      ))}
                  </div>
                }
                delayDuration={200}
              >
                <Badge variant="warning">
                  <Codicon name="warning" size={10} /> {warnings}
                </Badge>
              </Tooltip>
            )}
            {totalFindings > 0 && (
              <Tooltip
                content={
                  <div className="flex flex-col gap-0.5">
                    {findings.map((f) => (
                      <span key={f.ruleId}>
                        {f.ruleLabel}: {f.count} found
                      </span>
                    ))}
                  </div>
                }
                delayDuration={200}
              >
                <Badge variant="finding">
                  <Codicon name="debug-breakpoint-unsupported" size={10} /> {totalFindings}
                </Badge>
              </Tooltip>
            )}
          </span>
        )}

        {/* Status letter */}
        <span
          className={clsx(
            'text-11 font-mono font-semibold w-3 shrink-0',
            STATUS_COLOR_CLASS[file.status]
          )}
        >
          {STATUS_LETTER[file.status]}
        </span>
      </button>
    </DiffPopover>
  );
});

ListFileRow.displayName = 'ListFileRow';

interface ListWorktreeBoxProps {
  worktree: WorktreeState;
  onFileClick?: (worktreeId: string, filePath: string) => void;
}

function ListSectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
      <SectionLabel>{label}</SectionLabel>
    </div>
  );
}

const ListWorktreeBox = React.memo(({ worktree: wt, onFileClick }: ListWorktreeBoxProps) => {
  const { committed, staged, unstaged } = partitionFiles(wt);
  const isEmpty = committed.length === 0 && staged.length === 0 && unstaged.length === 0;

  return (
    <div className="min-w-80 border-2 border-dashed border-border-dashed rounded-xl bg-cluster-alpha overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border-dashed">
        <WorktreeHeader worktree={wt} />
      </div>

      {/* File list */}
      <div className="p-2">
        {isEmpty ? (
          <div className="text-text-faint text-11 px-3 py-2">No changes</div>
        ) : (
          <>
            {committed.length > 0 && (
              <>
                <ListSectionLabel label="Committed" />
                {committed.map((file) => (
                  <ListFileRow
                    key={`committed:${file.path}`}
                    file={file}
                    worktreeId={wt.id}
                    onFileClick={onFileClick}
                  />
                ))}
              </>
            )}
            {staged.length > 0 && (
              <>
                <ListSectionLabel label="Staged" />
                {staged.map((file) => (
                  <ListFileRow
                    key={`staged:${file.path}`}
                    file={file}
                    worktreeId={wt.id}
                    onFileClick={onFileClick}
                  />
                ))}
              </>
            )}
            {unstaged.length > 0 && (
              <>
                <ListSectionLabel label="Unstaged" />
                {unstaged.map((file) => (
                  <ListFileRow
                    key={`unstaged:${file.path}`}
                    file={file}
                    worktreeId={wt.id}
                    onFileClick={onFileClick}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
});

ListWorktreeBox.displayName = 'ListWorktreeBox';

interface ListViewProps {
  worktrees: WorktreeState[];
  onFileClick?: (worktreeId: string, filePath: string) => void;
}

export const ListView = React.memo(({ worktrees, onFileClick }: ListViewProps) => {
  const pan = useDragPan();
  return (
    <div
      ref={pan.containerRef}
      className="w-full h-full overflow-hidden select-none"
      style={{
        cursor: 'grab',
        backgroundImage: 'radial-gradient(circle, var(--color-grid-dot) 1px, transparent 1px)',
      }}
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
      onClickCapture={pan.onClickCapture}
    >
      <div ref={pan.translateRef}>
        <div ref={pan.contentRef} className="p-6">
          <div className="flex flex-row gap-4 items-start">
            {worktrees.map((wt) => (
              <ListWorktreeBox key={wt.id} worktree={wt} onFileClick={onFileClick} />
            ))}
            {worktrees.length === 0 && (
              <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ListView.displayName = 'ListView';
