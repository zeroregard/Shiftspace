import { Badge } from '@shiftspace/ui/badge';
import { Codicon } from '@shiftspace/ui/codicon';
import { Tooltip } from '@shiftspace/ui/tooltip';
import type { WorktreeState } from '../types';

interface SyncBadgeProps {
  worktree: WorktreeState;
}

/**
 * Compact indicator showing how the worktree's branch relates to its remote
 * tracking branch. Renders nothing when the branch is in sync.
 *
 * States:
 *  - ahead only     → teal ↑N badge (push needed)
 *  - behind only    → warning ↓N badge (pull needed)
 *  - diverged       → red ↑N ↓M badge (reconcile needed)
 *  - upstream gone  → warning cloud icon (remote branch deleted)
 *  - no upstream    → faint cloud icon (branch not published)
 *  - in sync        → null
 */
export function SyncBadge({ worktree: wt }: SyncBadgeProps) {
  const ahead = wt.ahead ?? 0;
  const behind = wt.behind ?? 0;

  // Upstream gone: configured but deleted on remote.
  if (wt.upstreamGone) {
    return (
      <Tooltip content={`Upstream ${wt.upstream ?? ''} no longer exists on remote`}>
        <span className="inline-flex items-center text-status-modified" aria-label="upstream gone">
          <Codicon name="cloud" size={12} />
        </span>
      </Tooltip>
    );
  }

  // No upstream configured at all.
  if (!wt.upstream) {
    return (
      <Tooltip content="No upstream branch — push -u to publish">
        <span
          className="inline-flex items-center text-text-faint opacity-60"
          aria-label="no upstream"
        >
          <Codicon name="cloud" size={12} />
        </span>
      </Tooltip>
    );
  }

  // In sync — render nothing.
  if (ahead === 0 && behind === 0) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    // TODO: wire to actions.pushBranch / actions.pullBranch when those land.
    e.stopPropagation();
  };

  // Diverged.
  if (ahead > 0 && behind > 0) {
    return (
      <Tooltip content={`Diverged from ${wt.upstream} — ${ahead} ahead, ${behind} behind`}>
        <span onClick={handleClick} aria-label={`diverged ${ahead} ahead ${behind} behind`}>
          <Badge variant="error">
            ↑{ahead} ↓{behind}
          </Badge>
        </span>
      </Tooltip>
    );
  }

  // Ahead only.
  if (ahead > 0) {
    return (
      <Tooltip content={`${ahead} commit${ahead === 1 ? '' : 's'} ahead — push to ${wt.upstream}`}>
        <span onClick={handleClick} aria-label={`${ahead} ahead`}>
          <Badge variant="info">↑{ahead}</Badge>
        </span>
      </Tooltip>
    );
  }

  // Behind only.
  return (
    <Tooltip
      content={`${behind} commit${behind === 1 ? '' : 's'} behind — pull from ${wt.upstream}`}
    >
      <span onClick={handleClick} aria-label={`${behind} behind`}>
        <Badge variant="warning">↓{behind}</Badge>
      </span>
    </Tooltip>
  );
}
