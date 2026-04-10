import { useShallow } from 'zustand/react/shallow';
import { useWorktreeStore, useInspectionStore, useInsightStore } from '../store';
import type { DiffMode } from '../types';
import { BranchPicker } from '../overlays/branch-picker';
import { IconButton } from '@shiftspace/ui/icon-button';
import { PackageSwitcher } from './package-switcher';
import { useActions } from '../ui/actions-context';
import { filterCheckoutableBranches } from '../utils/worktree-utils';

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
  const insightsRunning = useInsightStore((s) => s.insightsRunning);

  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
  const diffMode: DiffMode = wt?.diffMode ?? { type: 'working' };
  const defaultBranch = wt?.defaultBranch ?? 'main';
  const modeLabel =
    diffMode.type === 'working'
      ? 'Working changes'
      : diffMode.type === 'repo'
        ? 'All files'
        : `vs ${diffMode.branch}`;

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
        {
          key: 'repo',
          label: 'All files',
          selected: diffMode.type === 'repo',
          onSelect: () => actions.diffModeChange(wt.id, { type: 'repo' }),
        },
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
            <BranchPicker.Trigger
              className="text-text-primary hover:text-text-primary text-13 font-semibold truncate"
              title="Switch branch"
            >
              {wt.branch}
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
            <BranchPicker.Trigger
              icon="git-compare"
              variant="pill"
              className="text-text-muted hover:text-text-primary text-10 whitespace-nowrap"
            >
              <span style={{ opacity: isLoading ? 0.5 : 1 }}>{modeLabel}</span>
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

      {/* Insight status — cancel when running, recheck when idle */}
      {isInspecting && worktreeId && (
        <IconButton
          icon={insightsRunning ? 'sync~spin' : 'sync'}
          label={insightsRunning ? 'Cancel analysis' : 'Recheck code smells'}
          iconSize={14}
          className="text-text-faint hover:text-text-primary"
          onClick={() =>
            insightsRunning
              ? actions.cancelInsights(worktreeId)
              : actions.recheckInsights(worktreeId)
          }
        />
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
    </div>
  );
}
