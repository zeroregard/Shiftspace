import { Tooltip } from '@shiftspace/ui/tooltip';
import { Badge } from '@shiftspace/ui/badge';
import { Codicon } from '@shiftspace/ui/codicon';
import { Spinner } from '@shiftspace/ui/spinner';
import type { PrStatus } from '../types';
import { useActions } from '../ui/actions-context';

interface Props {
  prStatus: PrStatus;
}

/**
 * Compact cluster of PR status icons for a worktree card: CI state, merge
 * conflict, approval, and unresolved-comment count. Clicking anywhere on the
 * cluster opens the PR in the browser. Structure mirrors `AnnotationBadges`.
 *
 * Each signal is hidden when it has nothing to say (CI 'none', no conflict,
 * not approved, zero/unknown comments) so the row stays quiet until there's
 * something worth surfacing.
 */
export function PrStatusBadges({ prStatus }: Props) {
  const actions = useActions();
  const { ciStatus, conflicts, approved, unresolvedComments, url, number } = prStatus;

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    actions.openExternalUrl(url);
  };

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
