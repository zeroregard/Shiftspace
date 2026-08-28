import { useShallow } from 'zustand/react/shallow';
import { useWorktreeStore, useInspectionStore, useOperationStore } from '../store';
import { opKey, isOperationPending } from '../store/operation-store';
import type { DiffMode, WorktreeState } from '../types';
import { BranchPicker } from '../overlays/branch-picker';
import { IconButton } from '@shiftspace/ui/icon-button';
import { PackageSwitcher } from './package-switcher';
import { SortPicker } from './sort-picker';
import { useActions, type ShiftspaceActions } from '../ui/actions-context';
import { filterCheckoutableBranches } from '../utils/worktree-utils';
import { getComparisonBase } from '../utils/comparison-base';

const EMPTY_BRANCHES: string[] = [];

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

interface UnifiedHeaderProps {
  showPackageSwitcher: boolean;
  onSortChange?: (mode: import('../types').WorktreeSortMode) => void;
}

interface DiffModeOption {
  key: string;
  testId: string;
  label: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}

/**
 * The comparison choices offered for a worktree.
 *
 * The branch it merges into is promoted next to "Working changes" / "All
 * files" instead of being buried in the branch list, with a pill naming where
 * that branch came from: an open pull request's base (so a stacked PR is
 * compared against the slice below it) or the repo default.
 */
function buildDiffModeOptions(
  wt: WorktreeState | undefined,
  diffMode: DiffMode,
  branchList: string[],
  actions: ShiftspaceActions
): { staticOptions: DiffModeOption[]; branches: string[] } {
  if (!wt) return { staticOptions: [], branches: [] };

  const base = getComparisonBase(wt);
  const showBaseOption = Boolean(base.branch) && wt.branch !== base.branch;

  const staticOptions: DiffModeOption[] = [
    {
      key: 'working',
      testId: 'diff-mode-working',
      label: 'Working changes',
      selected: diffMode.type === 'working',
      onSelect: () => actions.diffModeChange(wt.id, { type: 'working' }),
    },
    ...(showBaseOption
      ? [
          {
            key: `default-${base.branch}`,
            testId: 'diff-mode-default-branch',
            label: base.branch,
            badge: base.fromPr ? 'pr base' : 'default',
            selected: isDiffModeEqual(diffMode, { type: 'branch', branch: base.branch }),
            onSelect: () => actions.diffModeChange(wt.id, { type: 'branch', branch: base.branch }),
          },
        ]
      : []),
    {
      key: 'repo',
      testId: 'diff-mode-repo',
      label: 'All files',
      selected: diffMode.type === 'repo',
      onSelect: () => actions.diffModeChange(wt.id, { type: 'repo' }),
    },
  ];

  return {
    staticOptions,
    branches: branchList.filter((b) => b !== wt.branch && !(showBaseOption && b === base.branch)),
  };
}

export function UnifiedHeader({ showPackageSwitcher, onSortChange }: UnifiedHeaderProps) {
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
  const isLoading = useOperationStore((s) =>
    worktreeId ? isOperationPending(s.operations, opKey.diffMode(worktreeId)) : false
  );
  const isFetchingBranches = useOperationStore((s) =>
    worktreeId ? isOperationPending(s.operations, opKey.fetchBranches(worktreeId)) : false
  );
  const lastFetchAt = useWorktreeStore((s) =>
    worktreeId ? s.lastFetchAt.get(worktreeId) : undefined
  );
  const occupiedBranches = useWorktreeStore(
    useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
  );
  const insightsRunning = useOperationStore((s) =>
    isOperationPending(s.operations, opKey.runInsights)
  );

  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
  const diffMode: DiffMode = wt?.diffMode ?? { type: 'working' };
  const modeLabel =
    diffMode.type === 'working'
      ? 'Working changes'
      : diffMode.type === 'repo'
        ? 'All files'
        : `vs ${diffMode.branch}`;
  const { staticOptions: diffModeStaticOptions, branches: diffModeBranches } = buildDiffModeOptions(
    wt,
    diffMode,
    branchList,
    actions
  );

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-dashed shrink-0">
      {/* Grove controls (left side) */}
      {!isInspecting && <SortPicker onSortChange={onSortChange} />}

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
              testId="diff-mode-picker"
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
