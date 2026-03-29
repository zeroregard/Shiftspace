import React from 'react';
import clsx from 'clsx';
import { useDragPan } from '../hooks/useDragPan';
import type { WorktreeState, FileChange, DiffMode } from '../types';
import { DiffPopover } from './DiffOverlay';
import { ThemedFileIcon } from './ThemedFileIcon';
import { WorktreeHeader } from './WorktreeHeader';
import { partitionFiles } from '../utils/listSections';

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
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
      <span className="text-10 font-semibold uppercase tracking-wider text-text-faint">
        {label}
      </span>
    </div>
  );
}

const ListWorktreeBox = React.memo(
  ({
    worktree: wt,
    onFileClick,
    onDiffModeChange,
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onSwapBranches,
  }: ListWorktreeBoxProps) => {
    const { committed, staged, unstaged } = partitionFiles(wt);
    const isEmpty = committed.length === 0 && staged.length === 0 && unstaged.length === 0;

    return (
      <div className="min-w-80 border-2 border-dashed border-border-dashed rounded-xl bg-cluster-alpha overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-border-dashed">
          <WorktreeHeader
            worktree={wt}
            onDiffModeChange={onDiffModeChange}
            onRequestBranchList={onRequestBranchList}
            onCheckoutBranch={onCheckoutBranch}
            onFetchBranches={onFetchBranches}
            onSwapBranches={onSwapBranches}
          />
        </div>

        {/* File list */}
        <div className="p-2">
          {isEmpty ? (
            <div className="text-text-faint text-11 px-3 py-2">No changes</div>
          ) : (
            <>
              {committed.length > 0 && (
                <>
                  <SectionLabel label="Committed" />
                  {committed.map((file) => (
                    <ListFileRow
                      key={file.path}
                      file={file}
                      worktreeId={wt.id}
                      onFileClick={onFileClick}
                    />
                  ))}
                </>
              )}
              {staged.length > 0 && (
                <>
                  <SectionLabel label="Staged" />
                  {staged.map((file) => (
                    <ListFileRow
                      key={file.path}
                      file={file}
                      worktreeId={wt.id}
                      onFileClick={onFileClick}
                    />
                  ))}
                </>
              )}
              {unstaged.length > 0 && (
                <>
                  <SectionLabel label="Unstaged" />
                  {unstaged.map((file) => (
                    <ListFileRow
                      key={file.path}
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
  }
);

ListWorktreeBox.displayName = 'ListWorktreeBox';

interface ListViewProps {
  worktrees: WorktreeState[];
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
}

export const ListView = React.memo(
  ({
    worktrees,
    onFileClick,
    onDiffModeChange,
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onSwapBranches,
  }: ListViewProps) => {
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
                <ListWorktreeBox
                  key={wt.id}
                  worktree={wt}
                  onFileClick={onFileClick}
                  onDiffModeChange={onDiffModeChange}
                  onRequestBranchList={onRequestBranchList}
                  onCheckoutBranch={onCheckoutBranch}
                  onFetchBranches={onFetchBranches}
                  onSwapBranches={onSwapBranches}
                />
              ))}
              {worktrees.length === 0 && (
                <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ListView.displayName = 'ListView';
