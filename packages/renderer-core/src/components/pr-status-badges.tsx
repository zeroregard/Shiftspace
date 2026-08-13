import { Tooltip } from '@shiftspace/ui/tooltip';
import { Badge } from '@shiftspace/ui/badge';
import { Codicon } from '@shiftspace/ui/codicon';
import { Spinner } from '@shiftspace/ui/spinner';
import type { PrStatus } from '../types';
import { useActions } from '../ui/actions-context';
import { MergedPrBadge } from './merged-pr-badge';

interface Props {
  prStatus: PrStatus;
  /** Worktree this PR belongs to — lets the merged menu offer deletion. */
  worktreeId?: string;
  /** False for the primary worktree, which can never be removed. */
  canDelete?: boolean;
}

/**
 * Compact cluster of PR status icons for a worktree card: CI state, merge
 * conflict, approval, and unresolved-comment count. Clicking anywhere on the
 * cluster opens the PR in the browser. Structure mirrors `AnnotationBadges`.
 *
 * Each signal is hidden when it has nothing to say (CI 'none', no conflict,
 * not approved, zero/unknown comments) so the row stays quiet until there's
 * something worth surfacing.
 *
 * Once the PR is merged the whole cluster collapses into a single purple
 * merged indicator (`MergedPrBadge`) — CI and review state are history at
 * that point, and the only useful next steps are opening the PR or cleaning
 * up the worktree.
 */
export function PrStatusBadges({ prStatus, worktreeId, canDelete }: Props) {
  const actions = useActions();
  const { ciStatus, conflicts, approved, unresolvedComments, url, number } = prStatus;

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    actions.openExternalUrl(url);
  };

  if (prStatus.state === 'merged') {
    return <MergedPrBadge prStatus={prStatus} worktreeId={worktreeId} canDelete={canDelete} />;
  }

  return (
    <span
      className="shrink-0 flex items-center gap-1 cursor-pointer"
      data-testid={`pr-status-${number}`}
      onClick={open}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <CiBadge ciStatus={ciStatus} />
      {conflicts === true && (
        <Tooltip content="Has merge conflicts" delayDuration={0}>
          <span data-testid="pr-badge-conflict">
            <Badge variant="error">
              <Codicon name="git-merge" size={12} />
            </Badge>
          </span>
        </Tooltip>
      )}
      {approved && (
        <Tooltip content="Approved" delayDuration={0}>
          <span data-testid="pr-badge-approved">
            <Badge variant="success">
              <Codicon name="verified-filled" size={12} />
            </Badge>
          </span>
        </Tooltip>
      )}
      {unresolvedComments !== undefined && unresolvedComments > 0 && (
        <Tooltip
          content={`${unresolvedComments} unresolved comment${unresolvedComments === 1 ? '' : 's'}`}
          delayDuration={0}
        >
          <span data-testid="pr-badge-comments">
            <Badge variant="warning">
              <Codicon name="comment" size={12} />
              {unresolvedComments}
            </Badge>
          </span>
        </Tooltip>
      )}
    </span>
  );
}

function CiBadge({ ciStatus }: { ciStatus: PrStatus['ciStatus'] }) {
  if (ciStatus === 'none') return null;
  if (ciStatus === 'running') {
    return (
      <Tooltip content="CI running" delayDuration={0}>
        <span data-testid="pr-badge-ci-running">
          <Badge variant="info">
            <Spinner icon="sync" size={12} />
          </Badge>
        </span>
      </Tooltip>
    );
  }
  const passing = ciStatus === 'passing';
  return (
    <Tooltip content={passing ? 'CI passing' : 'CI failing'} delayDuration={0}>
      <span data-testid={`pr-badge-ci-${ciStatus}`}>
        <Badge variant={passing ? 'success' : 'error'}>
          <Codicon name={passing ? 'pass' : 'error'} size={12} />
        </Badge>
      </span>
    </Tooltip>
  );
}
