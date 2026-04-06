import { useShallow } from 'zustand/react/shallow';
import type { WorktreeState } from '../types';
import { useWorktreeStore } from '../store';
import { BranchPicker } from '../overlays/BranchPicker';
import { filterCheckoutableBranches } from '../utils/worktreeUtils';
import { useActions } from '../ui/ActionsContext';
import { IconButton } from '@shiftspace/ui/icon-button';
import { Codicon } from '@shiftspace/ui/codicon';
import { Spinner } from '@shiftspace/ui/spinner';

const EMPTY_BRANCHES: string[] = [];

interface WorktreeHeaderProps {
  worktree: WorktreeState;
  /** When true, hides branch picker and stats — used in the tree canvas nodes */
  compact?: boolean;
}

export function WorktreeHeader({ worktree: wt, compact }: WorktreeHeaderProps) {
  const actions = useActions();
  const isSingle = useWorktreeStore((s) => s.worktrees.size <= 1);
  const branchList = useWorktreeStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
  const isFetchingBranches = useWorktreeStore((s) => s.fetchLoading.has(wt.id));
  const isSwapping = useWorktreeStore((s) => s.swapLoading.has(wt.id));
  const lastFetchAt = useWorktreeStore((s) => s.lastFetchAt.get(wt.id));
  const occupiedBranches = useWorktreeStore(
    useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
  );

  const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
  const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
  const pathPart = !isSingle && !wt.isMainWorktree ? folderName : null;
  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);

  if (compact) {
    return (
      <div className="font-semibold text-text-primary text-13 whitespace-nowrap flex items-center gap-1">
        {pathPart && <span>{pathPart} </span>}
        {isSwapping ? (
          <>
            <Spinner size={13} />
            <span className="text-text-faint">Swapping…</span>
          </>
        ) : (
          <>
            <Codicon name="git-branch" />
            <span>{pathPart ? `(${wt.branch})` : wt.branch}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-text-primary text-13 whitespace-nowrap flex items-center gap-1">
        {pathPart && <span>{pathPart} </span>}
        {isSwapping ? (
          <>
            <Spinner size={13} />
            <span className="text-text-faint">Swapping…</span>
          </>
        ) : (
          <BranchPicker
            onSelect={(branch) => actions.checkoutBranch(wt.id, branch)}
            onOpen={() => actions.requestBranchList(wt.id)}
          >
            <BranchPicker.Trigger
              className="text-text-faint hover:text-text-primary text-13 font-semibold"
              title="Switch branch"
              stopPropagation
            >
              {pathPart ? `(${wt.branch})` : wt.branch}
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
        )}
      </div>
      <div className="flex gap-1 mt-1">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1 shrink-0">
            {!wt.isMainWorktree && (
              <IconButton
                icon="arrow-swap"
                label="Swap branch with primary worktree"
                stopPropagation
                onClick={() => actions.swapBranches(wt.id)}
              />
            )}
          </div>
          <div className="ml-2 text-11 text-text-muted">
            {wt.files.length} file{wt.files.length !== 1 ? 's' : ''} ·{' '}
            <span className="text-status-added">+{totalAdded}</span>{' '}
            <span className="text-status-deleted">-{totalRemoved}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
