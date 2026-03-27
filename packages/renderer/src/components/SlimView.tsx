import React from 'react';
import type { WorktreeState, DiffMode } from '../types';
import { useShiftspaceStore } from '../store';
import { BranchPickerPopover } from './BranchPickerPopover';
import { GitCompareIcon } from '../icons';

// Stable reference — avoids returning a new [] each render
const EMPTY_BRANCHES: string[] = [];

interface SlimWorktreeBarProps {
  worktree: WorktreeState;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
}

const SlimWorktreeBar = React.memo(
  ({ worktree: wt, onDiffModeChange, onRequestBranchList }: SlimWorktreeBarProps) => {
    const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
    const isLoading = useShiftspaceStore((s) => s.diffModeLoading.has(wt.id));

    const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
    const isMain = wt.branch === 'main' || wt.branch === 'master';

    const modified = wt.files.filter((f) => f.status === 'modified').length;
    const added = wt.files.filter((f) => f.status === 'added').length;
    const deleted = wt.files.filter((f) => f.status === 'deleted').length;

    const diffMode: DiffMode = wt.diffMode ?? { type: 'working' };
    const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;

    const diffModeBranches = branchList.filter((b) => b !== wt.branch);
    const defaultBranch = wt.defaultBranch ?? 'main';

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

    return (
      <div className="flex items-center gap-3 px-4 py-2.5 border-2 border-dashed border-border-dashed rounded-xl bg-cluster-alpha text-text-primary">
        {/* Name + branch */}
        <div className="font-semibold text-13 text-text-primary whitespace-nowrap">
          {isMain ? wt.branch : `${folderName} (${wt.branch})`}
        </div>

        {/* Status counts */}
        <div className="flex items-center gap-2 text-11 flex-1 min-w-0">
          {modified > 0 && <span className="text-status-modified">{modified} modified</span>}
          {modified > 0 && (added > 0 || deleted > 0) && <span className="text-text-faint">·</span>}
          {added > 0 && <span className="text-status-added">{added} added</span>}
          {added > 0 && deleted > 0 && <span className="text-text-faint">·</span>}
          {deleted > 0 && <span className="text-status-deleted">{deleted} deleted</span>}
          {modified === 0 && added === 0 && deleted === 0 && (
            <span className="text-text-faint">no changes</span>
          )}
        </div>

        {/* Diff mode selector */}
        <div className="shrink-0">
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
      </div>
    );
  }
);

SlimWorktreeBar.displayName = 'SlimWorktreeBar';

interface SlimViewProps {
  worktrees: WorktreeState[];
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
}

export const SlimView = React.memo(
  ({ worktrees, onDiffModeChange, onRequestBranchList }: SlimViewProps) => {
    return (
      <div className="w-full h-full overflow-y-auto p-6">
        <div className="flex flex-col gap-2 max-w-3xl mx-auto">
          {worktrees.map((wt) => (
            <SlimWorktreeBar
              key={wt.id}
              worktree={wt}
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

SlimView.displayName = 'SlimView';
