import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { NodeComponentProps } from '../TreeCanvas';
import type { WorktreeState, DiffMode } from '../types';
import { useShiftspaceStore } from '../store';
import { BranchPickerPopover } from './BranchPickerPopover';
import { filterCheckoutableBranches } from '../utils/worktreeUtils';
import { GitBranchIcon, GitCompareIcon } from '../icons';

// Stable reference — avoids returning a new [] each render, which would cause
// useSyncExternalStore (Zustand) to see a changed snapshot every render → #185.
const EMPTY_BRANCHES: string[] = [];

export interface WorktreeNodeData {
  worktree: WorktreeState;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  [key: string]: unknown;
}

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

export const WorktreeNode = React.memo(({ data }: NodeComponentProps<WorktreeNodeData>) => {
  const wt = data.worktree;
  const isSingle = useShiftspaceStore((s) => s.worktrees.size <= 1);
  const branchList = useShiftspaceStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
  const isLoading = useShiftspaceStore((s) => s.diffModeLoading.has(wt.id));
  const isFetchingBranches = useShiftspaceStore((s) => s.fetchLoading.has(wt.id));
  const lastFetchAt = useShiftspaceStore((s) => s.lastFetchAt.get(wt.id));
  // All branches currently checked out across every worktree — stable via useShallow.
  const occupiedBranches = useShiftspaceStore(
    useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
  );

  const totalAdded = wt.files.reduce((s, f) => s + f.linesAdded, 0);
  const totalRemoved = wt.files.reduce((s, f) => s + f.linesRemoved, 0);
  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
  const isMain = wt.branch === 'main' || wt.branch === 'master';
  const pathPart = isMain ? null : folderName;

  const diffMode: DiffMode = wt.diffMode ?? { type: 'working' };
  const defaultBranch = wt.defaultBranch ?? 'main';

  const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;

  // Branches for the checkout picker — exclude any branch already checked out
  // in ANY worktree (git rejects switching to an occupied branch).
  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);

  // Static options for the diff mode picker
  const diffModeStaticOptions = [
    {
      key: 'working',
      label: 'Working changes',
      selected: diffMode.type === 'working',
      onSelect: () => data.onDiffModeChange?.(wt.id, { type: 'working' }),
    },
    ...(branchList.includes(defaultBranch) || !defaultBranch
      ? []
      : [
          {
            key: `default-${defaultBranch}`,
            label: `vs ${defaultBranch}`,
            selected: isDiffModeEqual(diffMode, { type: 'branch', branch: defaultBranch }),
            onSelect: () =>
              data.onDiffModeChange?.(wt.id, { type: 'branch', branch: defaultBranch }),
          },
        ]),
  ];

  // Branches for diff mode: exclude current branch, show all others
  const diffModeBranches = branchList.filter((b) => b !== wt.branch);

  return (
    <div className="w-full h-full border-2 border-dashed border-border-dashed rounded-2xl bg-cluster-alpha text-text-primary px-7.5 py-5 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-text-primary text-13 whitespace-nowrap flex items-center gap-1">
            {!isSingle && pathPart && <span>{pathPart} </span>}
            {/* Branch name — click to switch branches */}
            <BranchPickerPopover
              trigger={
                <button
                  className="flex items-center gap-1 text-text-faint font-normal hover:text-text-primary cursor-pointer bg-transparent border-none p-0 text-13 font-semibold"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  title="Switch branch"
                >
                  <GitBranchIcon />
                  {!isSingle && pathPart ? `(${wt.branch})` : wt.branch}
                </button>
              }
              branches={checkoutBranches}
              selectedBranch={wt.branch}
              onSelectBranch={(branch) => data.onCheckoutBranch?.(wt.id, branch)}
              onOpen={() => data.onRequestBranchList?.(wt.id)}
              onFetch={data.onFetchBranches ? () => data.onFetchBranches!(wt.id) : undefined}
              isFetching={isFetchingBranches}
              lastFetchAt={lastFetchAt}
            />
          </div>
          <div className="text-11 text-text-muted mt-0.5">
            {wt.files.length} file{wt.files.length !== 1 ? 's' : ''} ·{' '}
            <span className="text-status-added">+{totalAdded}</span>{' '}
            <span className="text-status-deleted">-{totalRemoved}</span>
          </div>
          {wt.process && (
            <div className="mt-1 text-10 text-teal bg-process-badge rounded-sm px-1 py-px inline-block">
              :{wt.process.port}
            </div>
          )}
        </div>

        {/* Diff mode selector */}
        <BranchPickerPopover
          trigger={
            <button
              className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted text-10 whitespace-nowrap cursor-pointer bg-transparent shrink-0"
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
          onSelectBranch={(branch) => data.onDiffModeChange?.(wt.id, { type: 'branch', branch })}
          onOpen={() => data.onRequestBranchList?.(wt.id)}
        />
      </div>
    </div>
  );
});

WorktreeNode.displayName = 'WorktreeNode';
