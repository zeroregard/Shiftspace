import type { WorktreeState } from '@shiftspace/renderer-core';
import { useActions } from '@shiftspace/renderer-core';
import { WorktreeCard } from './components/WorktreeCard';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';

interface GroveViewProps {
  worktrees: WorktreeState[];
}

function WorktreeCardError() {
  return (
    <div className="w-[32rem] flex items-center justify-center p-4 rounded-xl border-2 border-dashed border-status-deleted/30 text-text-faint text-11">
      Failed to render worktree
    </div>
  );
}

export function GroveView({ worktrees }: GroveViewProps) {
  const actions = useActions();

  return (
    <div className="w-full h-full overflow-auto">
      <div className="p-6">
        {worktrees.length === 0 ? (
          <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
        ) : (
          <div className="flex flex-row flex-wrap gap-4 items-start">
            {worktrees.map((wt) => (
              <ErrorBoundary key={wt.id} fallback={<WorktreeCardError />}>
                <WorktreeCard worktree={wt} />
              </ErrorBoundary>
            ))}
            <button
              className="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-dashed border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default bg-transparent cursor-pointer transition-colors self-center shrink-0"
              onClick={() => actions.addWorktree()}
              aria-label="Add worktree"
              data-testid="add-worktree"
            >
              <i className="codicon codicon-add" style={{ fontSize: 14 }} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
