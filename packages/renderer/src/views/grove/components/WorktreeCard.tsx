import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { WorktreeState } from '../../../types';
import { useShiftspaceStore } from '../../../store';
import { BranchPicker } from '../../../overlays/BranchPicker';
import { Codicon } from '../../../ui/Codicon';
import { ActionBar } from '../../inspection/components/ActionBar';
import { filterCheckoutableBranches } from '../../../utils/worktreeUtils';
import { useActions } from '../../../ui/ActionsContext';
import { IconButton } from '../../../ui/IconButton';
import { Input } from '../../../ui/Input';

const EMPTY_BRANCHES: string[] = [];

interface WorktreeCardProps {
  worktree: WorktreeState;
}

export const WorktreeCard = React.memo(({ worktree: wt }: WorktreeCardProps) => {
  const actions = useActions();
  const enterInspection = useShiftspaceStore((s) => s.enterInspection);
  const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
  const isFetchingBranches = useShiftspaceStore((s) => s.fetchLoading.has(wt.id));
  const lastFetchAt = useShiftspaceStore((s) => s.lastFetchAt.get(wt.id));
  const occupiedBranches = useShiftspaceStore(
    useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
  );

  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
  const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;

  const startRename = () => {
    setRenameValue(folderName);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folderName) {
      actions.renameWorktree(wt.id, trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <div className="group w-[32rem] flex flex-col gap-3 p-4 rounded-xl border-2 border-dashed border-border-dashed bg-cluster-alpha text-text-primary transition-colors">
      {/* Workspace name + branch picker */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isRenaming ? (
            <>
              <Input
                inputRef={renameInputRef}
                variant="ghost"
                className="font-semibold text-13 flex-1 min-w-0"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
              />
              <IconButton
                icon="check"
                label="Confirm rename"
                size="sm"
                ghost
                tooltip={false}
                onClick={(e) => {
                  e.stopPropagation();
                  commitRename();
                }}
              />
            </>
          ) : (
            <button
              data-testid={`enter-inspection-${wt.id}`}
              className="font-semibold text-13 text-text-primary truncate text-left bg-transparent border-none p-0 cursor-pointer hover:text-text-secondary transition-colors flex-1 min-w-0"
              onClick={() => enterInspection(wt.id)}
            >
              {folderName}
            </button>
          )}
          {!wt.isMainWorktree && !isRenaming && (
            <>
              <IconButton
                icon="edit"
                label="Rename worktree"
                size="sm"
                ghost
                groupVisible
                tooltip={false}
                onClick={(e) => {
                  e.stopPropagation();
                  startRename();
                }}
              />
              <IconButton
                icon="trash"
                label="Remove worktree"
                size="sm"
                ghost
                groupVisible
                danger
                tooltip={false}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.removeWorktree(wt.id);
                }}
              />
            </>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 min-w-0"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!wt.isMainWorktree && (
            <IconButton
              icon="arrow-swap"
              label="Swap branch with primary worktree"
              size="sm"
              tooltip={false}
              onClick={(e) => {
                e.stopPropagation();
                actions.swapBranches(wt.id);
              }}
            />
          )}
          <BranchPicker
            onSelect={(branch) => actions.checkoutBranch(wt.id, branch)}
            onOpen={() => actions.requestBranchList(wt.id)}
          >
            <BranchPicker.Trigger>
              <button
                className="flex items-center gap-1 min-w-0 max-w-full text-text-muted hover:text-text-primary cursor-pointer bg-transparent border-none p-0 text-11"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                title={wt.branch}
              >
                <span className="shrink-0">
                  <Codicon name="git-branch" />
                </span>
                <span className="truncate">{wt.branch}</span>
              </button>
            </BranchPicker.Trigger>
            <BranchPicker.Content>
              <BranchPicker.SearchRow
                fetch={{
                  onFetch: () => actions.fetchBranches(wt.id),
                  isFetching: isFetchingBranches,
                  lastFetchAt,
                }}
              />
              <BranchPicker.Branches branches={checkoutBranches} selected={wt.branch} />
            </BranchPicker.Content>
          </BranchPicker>
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ActionBar worktreeId={wt.id} />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-11">
        <span className="text-text-muted">
          {wt.files.length} file{wt.files.length !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-status-added">+{totalAdded}</span>
          <span className="text-status-deleted">-{totalRemoved}</span>
        </span>
      </div>
    </div>
  );
});

WorktreeCard.displayName = 'WorktreeCard';
