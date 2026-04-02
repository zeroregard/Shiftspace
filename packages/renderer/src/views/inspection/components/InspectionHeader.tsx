import type { DiffMode, WorktreeState } from '../../../types';
import { useInspectionStore } from '../../../store';
import { BranchPicker } from '../../../overlays/BranchPicker';
import { Codicon } from '../../../ui/Codicon';
import { IconButton } from '../../../ui/IconButton';
import { useActions } from '../../../ui/ActionsContext';

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

interface InspectionHeaderProps {
  wt: WorktreeState;
  branchList: string[];
  checkoutBranches: string[];
  isLoading: boolean;
  isFetchingBranches: boolean;
  lastFetchAt: number | undefined;
}

export function InspectionHeader({
  wt,
  branchList,
  checkoutBranches,
  isLoading,
  isFetchingBranches,
  lastFetchAt,
}: InspectionHeaderProps) {
  const actions = useActions();
  const exitInspection = useInspectionStore((s) => s.exitInspection);

  const diffMode: DiffMode = wt.diffMode ?? { type: 'working' };
  const defaultBranch = wt.defaultBranch ?? 'main';
  const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;

  const diffModeStaticOptions = [
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
  ];

  const diffModeBranches = branchList.filter((b) => b !== wt.branch);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-dashed shrink-0">
      <IconButton icon="arrow-left" label="Back" onClick={exitInspection} iconSize={11} />

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
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
      </div>

      <IconButton
        icon="refresh"
        label="Re-check insights"
        iconSize={11}
        onClick={() => actions.recheckInsights(wt.id)}
      />

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
    </div>
  );
}
