import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useShallow } from 'zustand/react/shallow';
import { useWorktreeStore, useInspectionStore } from '../store';
import type { DiffMode } from '../types';
import { BranchPicker } from '../overlays/BranchPicker';
import { Codicon } from '@shiftspace/ui/codicon';
import { IconButton } from '@shiftspace/ui/icon-button';
import { PackageSwitcher } from './PackageSwitcher';
import { useActions } from '../ui/ActionsContext';
import { filterCheckoutableBranches } from '../utils/worktreeUtils';

const EMPTY_BRANCHES: string[] = [];

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

interface UnifiedHeaderProps {
  showPackageSwitcher: boolean;
}

export function UnifiedHeader({ showPackageSwitcher }: UnifiedHeaderProps) {
  const actions = useActions();
  const mode = useInspectionStore((s) => s.mode);
  const exitInspection = useInspectionStore((s) => s.exitInspection);
  const isInspecting = mode.type === 'inspection';
  const worktreeId = isInspecting ? mode.worktreeId : null;

  // Always call hooks unconditionally; return stable defaults when not inspecting
  const wt = useWorktreeStore((s) => (worktreeId ? s.worktrees.get(worktreeId) : undefined));
  const branchList = useWorktreeStore((s) =>
    worktreeId ? (s.branchLists.get(worktreeId) ?? EMPTY_BRANCHES) : EMPTY_BRANCHES
  );
  const isLoading = useWorktreeStore((s) =>
    worktreeId ? s.diffModeLoading.has(worktreeId) : false
  );
  const isFetchingBranches = useWorktreeStore((s) =>
    worktreeId ? s.fetchLoading.has(worktreeId) : false
  );
  const lastFetchAt = useWorktreeStore((s) =>
    worktreeId ? s.lastFetchAt.get(worktreeId) : undefined
  );
  const occupiedBranches = useWorktreeStore(
    useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
  );

  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
  const diffMode: DiffMode = wt?.diffMode ?? { type: 'working' };
  const defaultBranch = wt?.defaultBranch ?? 'main';
  const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;

  const diffModeStaticOptions = wt
    ? [
        {
          key: 'working',
          label: 'Working changes',
          selected: diffMode.type === 'working',
          onSelect: () => actions.diffModeChange(wt.id, { type: 'working' }),
        },
        ...(branchList.includes(defaultBranch) || !defaultBranch
          ? []
          : [
              {
                key: `default-${defaultBranch}`,
                label: `vs ${defaultBranch}`,
                selected: isDiffModeEqual(diffMode, { type: 'branch', branch: defaultBranch }),
                onSelect: () =>
                  actions.diffModeChange(wt.id, { type: 'branch', branch: defaultBranch }),
              },
            ]),
      ]
    : [];

  const diffModeBranches = wt ? branchList.filter((b) => b !== wt.branch) : [];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-dashed shrink-0">
      {/* Inspection controls (left side) */}
      {isInspecting && wt && (
        <>
          <IconButton icon="arrow-left" label="Back" onClick={exitInspection} iconSize={11} />

          <BranchPicker
            onSelect={(branch) => actions.checkoutBranch(wt.id, branch)}
            onOpen={() => actions.requestBranchList(wt.id)}
          >
            <BranchPicker.Trigger>
              <button
                className="flex items-center gap-1 text-text-primary hover:text-text-primary cursor-pointer bg-transparent border-none p-0 text-13 font-semibold truncate"
                title="Switch branch"
              >
                <Codicon name="git-branch" />
                {wt.branch}
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

          <BranchPicker
            onSelect={(branch) => actions.diffModeChange(wt.id, { type: 'branch', branch })}
            onOpen={() => actions.requestBranchList(wt.id)}
          >
            <BranchPicker.Trigger>
              <button className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted text-10 whitespace-nowrap cursor-pointer bg-transparent">
                <Codicon name="git-compare" />
                <span style={{ opacity: isLoading ? 0.5 : 1 }}>{modeLabel}</span>
              </button>
            </BranchPicker.Trigger>
            <BranchPicker.Content>
              <BranchPicker.Search />
              <BranchPicker.Options options={diffModeStaticOptions} />
              <BranchPicker.Separator />
              <BranchPicker.Branches
                branches={diffModeBranches}
                selected={diffMode.type === 'branch' ? diffMode.branch : null}
                labelFn={(b) => `vs ${b}`}
              />
            </BranchPicker.Content>
          </BranchPicker>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Right side — always present */}
      {showPackageSwitcher && (
        <PackageSwitcher
          onSetPackage={actions.setPackage}
          onDetectPackages={actions.detectPackages}
        />
      )}

      <EllipsisMenu
        disabled={!isInspecting}
        onRefresh={worktreeId ? () => actions.recheckInsights(worktreeId) : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ellipsis (3-dot) menu
// ---------------------------------------------------------------------------

interface EllipsisMenuProps {
  disabled: boolean;
  onRefresh?: () => void;
}

const EllipsisMenu = React.memo(({ disabled, onRefresh }: EllipsisMenuProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <Popover.Trigger asChild>
        <span>
          <IconButton icon="ellipsis" label="More actions" iconSize={13} disabled={disabled} />
        </span>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 min-w-[140px] bg-node-file border border-border-dashed rounded-lg shadow-lg overflow-hidden animate-popover-open"
          sideOffset={4}
          align="end"
        >
          <div className="py-1">
            <button
              className="w-full text-left px-3 py-1.5 text-11 text-text-primary hover:bg-node-file-pulse cursor-pointer bg-transparent border-none flex items-center gap-1.5"
              onClick={() => {
                onRefresh?.();
                setOpen(false);
              }}
            >
              <Codicon name="refresh" size={12} />
              Refresh
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
EllipsisMenu.displayName = 'EllipsisMenu';
