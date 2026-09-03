import { useShallow } from 'zustand/react/shallow';
import type { WorktreeState } from '@shiftspace/renderer-core';
import {
  useWorktreeStore,
  useInspectionStore,
  useOperationStore,
  BranchPicker,
  ConfirmPopover,
  ActionBar,
  PlanButton,
  PrStatusBadges,
  TicketLinkButton,
  useSettingsStore,
  buildTicketUrl,
  resolveWorktreeDiffCounts,
  filterCheckoutableBranches,
  useActions,
  useWorktreeRename,
  useRelativeTime,
  worktreeVisibilityClass,
  AnimatedTimestamp,
  opKey,
  isOperationPending,
} from '@shiftspace/renderer-core';
import { IconButton } from '@shiftspace/ui/icon-button';
import { Input } from '@shiftspace/ui/input';
import { Link } from '@shiftspace/ui/link';
import { WorktreeBadge } from '@shiftspace/ui/worktree-badge';

const EMPTY_BRANCHES: string[] = [];

// Branch picker row — extracted to keep WorktreeCard under the line limit

interface BranchRowProps {
  wt: WorktreeState;
}

function BranchRow({ wt }: BranchRowProps) {
  const actions = useActions();
  const branchList = useWorktreeStore((s) => s.branchLists.get(wt.id) ?? EMPTY_BRANCHES);
  const occupiedBranches = useWorktreeStore(
    useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
  );
  const isFetchingBranches = useOperationStore((s) =>
    isOperationPending(s.operations, opKey.fetchBranches(wt.id))
  );
  const lastFetchAt = useWorktreeStore((s) => s.lastFetchAt.get(wt.id));
  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
  return (
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
        <BranchPicker.Trigger
          className="min-w-0 max-w-full text-text-muted hover:text-text-primary text-11"
          title={wt.branch}
          stopPropagation
        >
          <span className="truncate">{wt.branch}</span>
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
  );
}

type WorktreeCardVariant = 'full' | 'slim';

interface WorktreeCardProps {
  worktree: WorktreeState;
  variant?: WorktreeCardVariant;
  /** Override the default click behavior (enter inspection). Used by the sidebar to open a tab instead. */
  onWorktreeClick?: (worktreeId: string) => void;
}

export function WorktreeCard({
  worktree: wt,
  variant = 'full',
  onWorktreeClick,
}: WorktreeCardProps) {
  const actions = useActions();
  const enterInspection = useInspectionStore((s) => s.enterInspection);
  const isRemoving = useOperationStore((s) =>
    isOperationPending(s.operations, opKey.removeWorktree(wt.id))
  );

  const diffCountMode = useSettingsStore((s) => s.worktreeDiffCount);
  const visibility = useSettingsStore((s) => s.worktreeVisibility);
  const actionsClass = worktreeVisibilityClass(visibility.actions);
  const githubStatusClass = worktreeVisibilityClass(visibility.githubStatus);
  const diffCountClass = worktreeVisibilityClass(visibility.diffCount);
  const timestampClass = worktreeVisibilityClass(visibility.timestamp);
  const counts = resolveWorktreeDiffCounts(wt, diffCountMode);
  const relativeTime = useRelativeTime(wt.lastActivityAt);
  const folderName = wt.path.split('/').filter(Boolean).pop() ?? wt.path;
  const ticketUrlTemplate = useSettingsStore((s) => s.ticketUrlTemplate);
  const ticketUrl = ticketUrlTemplate ? buildTicketUrl(ticketUrlTemplate, wt.branch) : null;

  const {
    isRenaming,
    renameValue,
    renameInputRef,
    setRenameValue,
    startRename,
    commitRename,
    cancelRename,
  } = useWorktreeRename(wt.id, folderName);

  return (
    <div
      data-removing={isRemoving ? 'true' : undefined}
      className={`group ${variant === 'full' ? 'w-[32rem] gap-3 p-4' : 'w-full gap-2 p-3'} flex flex-col rounded-xl border-2 border-dashed border-border-dashed bg-cluster-alpha text-text-primary transition-[opacity,colors] ${isRemoving ? 'opacity-60 pointer-events-none animate-pulse' : ''}`}
    >
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
                  if (e.key === 'Escape') cancelRename();
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
            <Link
              data-testid={`enter-inspection-${wt.id}`}
              className="font-semibold text-13 text-text-primary truncate hover:text-text-secondary flex-1 min-w-0"
              onClick={() => (onWorktreeClick ? onWorktreeClick(wt.id) : enterInspection(wt.id))}
            >
              {folderName}
            </Link>
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
                disabled={isRemoving}
                onClick={(e) => {
                  e.stopPropagation();
                  startRename();
                }}
              />
              {isRemoving ? (
                <IconButton
                  icon="loading"
                  label="Deleting worktree…"
                  size="sm"
                  ghost
                  iconAnimation="spin 1s linear infinite"
                  disabled
                />
              ) : (
                <ConfirmPopover
                  confirmIcon="trash"
                  danger
                  hideCancel
                  onConfirm={() => actions.removeWorktree(wt.id)}
                >
                  <span>
                    <IconButton
                      icon="trash"
                      label="Remove worktree"
                      size="sm"
                      ghost
                      groupVisible
                      danger
                      tooltip={false}
                      data-testid={`remove-worktree-${wt.id}`}
                    />
                  </span>
                </ConfirmPopover>
              )}
            </>
          )}
          {wt.planPath && !isRenaming && <PlanButton worktreeId={wt.id} planPath={wt.planPath} />}
          {ticketUrl && !isRenaming && <TicketLinkButton worktreeId={wt.id} url={ticketUrl} />}
          {wt.prStatus && !isRenaming && githubStatusClass !== null && (
            <span className={githubStatusClass}>
              <PrStatusBadges
                prStatus={wt.prStatus}
                worktreeId={wt.id}
                canDelete={!wt.isMainWorktree}
              />
            </span>
          )}
          {wt.badge && !isRenaming && (
            <WorktreeBadge
              label={wt.badge.label}
              color={wt.badge.color}
              description={wt.badge.description}
            />
          )}
        </div>
        <BranchRow wt={wt} />
      </div>

      {/* Action buttons (hidden in slim variant) */}
      {variant === 'full' && actionsClass !== null && (
        <div
          className={`flex flex-col ${actionsClass}`}
          data-testid={`worktree-actions-${wt.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ActionBar worktreeId={wt.id} />
        </div>
      )}

      {/* Stats */}
      {(diffCountClass !== null || timestampClass !== null) && (
        <div className="flex items-center justify-between text-11">
          {diffCountClass !== null && (
            <span
              className={`flex items-center gap-1.5 ${diffCountClass}`}
              data-testid={`worktree-diff-count-${wt.id}`}
              title={
                counts.comparedTo
                  ? `Committed and uncommitted changes on this branch, compared to ${counts.comparedTo}`
                  : 'Uncommitted changes in the working tree'
              }
            >
              <span className="text-text-muted">
                {counts.fileCount} file{counts.fileCount !== 1 ? 's' : ''}
              </span>
              <span className="text-status-added">+{counts.linesAdded}</span>
              <span className="text-status-deleted">-{counts.linesRemoved}</span>
              {counts.comparedTo && (
                <span className="text-text-muted truncate">vs {counts.comparedTo}</span>
              )}
            </span>
          )}
          {timestampClass !== null && (
            <span
              className={`ml-auto ${timestampClass}`}
              data-testid={`worktree-timestamp-${wt.id}`}
            >
              <AnimatedTimestamp value={relativeTime} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
