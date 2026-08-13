import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Badge } from '@shiftspace/ui/badge';
import { Button } from '@shiftspace/ui/button';
import { Codicon } from '@shiftspace/ui/codicon';
import type { PrStatus } from '../types';
import { useActions } from '../ui/actions-context';

interface Props {
  prStatus: PrStatus;
  /** Worktree this PR belongs to — required to offer the delete option. */
  worktreeId?: string;
  /** False for the primary worktree, which can never be removed. */
  canDelete?: boolean;
}

/**
 * Purple "merged" indicator shown on a worktree card once its branch's PR has
 * landed. Replaces the CI/approval/comment cluster — none of those signals
 * matter anymore; what matters is that the worktree is now dead weight.
 *
 * Clicking it opens a small menu with the two things you'd want next: jump to
 * the merged PR, or delete the worktree. Users who never want to make that
 * choice can turn on `shiftspace.pr.autoDeleteMergedWorktrees`.
 */
export function MergedPrBadge({ prStatus, worktreeId, canDelete = true }: Props) {
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const { url, number } = prStatus;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <span
          className="shrink-0 flex items-center gap-1 cursor-pointer"
          data-testid={`pr-status-${number}`}
          title={`PR #${number} merged`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Badge variant="finding">
            <span data-testid="pr-badge-merged" className="flex items-center gap-0.5">
              <Codicon name="git-merge" size={12} />
              Merged
            </span>
          </Badge>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 animate-popover-open flex flex-col gap-1 rounded-lg border border-border-default bg-node-file p-1.5 shadow-lg"
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            variant="ghost"
            icon="link-external"
            data-testid="merged-go-to-pr"
            onClick={() => {
              setOpen(false);
              actions.openExternalUrl(url);
            }}
          >
            Go to PR
          </Button>
          {canDelete && worktreeId && (
            <Button
              size="sm"
              variant="danger"
              icon="trash"
              data-testid="merged-delete-worktree"
              onClick={() => {
                setOpen(false);
                actions.removeWorktree(worktreeId);
              }}
            >
              Delete
            </Button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
