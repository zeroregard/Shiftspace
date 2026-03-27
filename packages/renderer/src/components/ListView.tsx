import React from 'react';
import clsx from 'clsx';
import type { WorktreeState, FileChange, DiffMode } from '../types';
import { useShiftspaceStore } from '../store';
import { BranchPickerPopover } from './BranchPickerPopover';
import { GitCompareIcon } from '../icons';
import { FileIcon } from '../icons';
import { DiffPopover } from './DiffOverlay';

// Stable reference
const EMPTY_BRANCHES: string[] = [];

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
  const fileName = file.path.split('/').pop() ?? file.path;
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
        {/* Status letter */}
        <span
          className={clsx(
            'text-11 font-mono font-semibold w-3 shrink-0',
            STATUS_COLOR_CLASS[file.status]
          )}
        >
          {STATUS_LETTER[file.status]}
        </span>

        {/* File icon */}
        <span className="shrink-0 flex items-center">
          <FileIcon filename={fileName} size={12} />
        </span>

        {/* File path */}
        <span
          className={clsx(
            'text-11 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
            isDeleted ? 'text-status-deleted line-through' : 'text-text-primary'
          )}
        >
          {file.path}
        </span>

        {/* Line counts */}
        <span className="text-10 text-text-faint shrink-0 font-mono">
          <span className="text-status-added">+{file.linesAdded}</span>{' '}
          <span className="text-status-deleted">-{file.linesRemoved}</span>
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
}

const ListWorktreeBox = React.memo(
  ({ worktree: wt, onFileClick, onDiffModeChange, onRequestBranchList }: ListWorktreeBoxProps) => {
    const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
    const isLoading = useShiftspaceStore((s) => s.diffModeLoading.has(wt.id));

    const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
    const isMain = wt.branch === 'main' || wt.branch === 'master';
    const title = isMain ? wt.branch : `${folderName} (${wt.branch})`;

    const diffMode: DiffMode = wt.diffMode ?? { type: 'working' };
    const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;
    const defaultBranch = wt.defaultBranch ?? 'main';

    const diffModeBranches = branchList.filter((b) => b !== wt.branch);
    const diffModeStaticOptions = [
      {
        key: 'working',
        label: 'Working changes',
        selected: diffMode.type === 'working',
        onSelect: () => onDiffModeChange?.(wt.id, { type: 'working' }),
      },
      ...(branchList.includes(defaultBranch) || !defaultBranch
        ? []
        : [
            {
              key: `default-${defaultBranch}`,
              label: `vs ${defaultBranch}`,
              selected: diffMode.type === 'branch' && diffMode.branch === defaultBranch,
              onSelect: () => onDiffModeChange?.(wt.id, { type: 'branch', branch: defaultBranch }),
            },
          ]),
    ];

    // Sort files: by status then path
    const sortedFiles = [...wt.files].sort((a, b) => {
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      return a.path.localeCompare(b.path);
    });

    return (
      <div className="border-2 border-dashed border-border-dashed rounded-xl bg-cluster-alpha overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-dashed">
          <span className="font-semibold text-13 text-text-primary">{title}</span>
          <BranchPickerPopover
            trigger={
              <button
                className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted text-10 whitespace-nowrap cursor-pointer bg-transparent"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <GitCompareIcon />
                <span style={{ opacity: isLoading ? 0.5 : 1 }}>{modeLabel}</span>
              </button>
            }
            branches={diffModeBranches}
            selectedBranch={diffMode.type === 'branch' ? diffMode.branch : null}
            staticOptions={diffModeStaticOptions}
            branchLabel={(b) => `vs ${b}`}
            onSelectBranch={(branch) => onDiffModeChange?.(wt.id, { type: 'branch', branch })}
            onOpen={() => onRequestBranchList?.(wt.id)}
          />
        </div>

        {/* File list */}
        <div className="p-2">
          {sortedFiles.length === 0 ? (
            <div className="text-text-faint text-11 px-3 py-2">No changes</div>
          ) : (
            sortedFiles.map((file) => (
              <ListFileRow
                key={file.path}
                file={file}
                worktreeId={wt.id}
                onFileClick={onFileClick}
              />
            ))
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
}

export const ListView = React.memo(
  ({ worktrees, onFileClick, onDiffModeChange, onRequestBranchList }: ListViewProps) => {
    return (
      <div className="w-full h-full overflow-y-auto p-6">
        <div className="flex flex-col gap-4 max-w-3xl mx-auto">
          {worktrees.map((wt) => (
            <ListWorktreeBox
              key={wt.id}
              worktree={wt}
              onFileClick={onFileClick}
              onDiffModeChange={onDiffModeChange}
              onRequestBranchList={onRequestBranchList}
            />
          ))}
          {worktrees.length === 0 && (
            <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
          )}
        </div>
      </div>
    );
  }
);

ListView.displayName = 'ListView';
