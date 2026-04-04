import type { WorktreeState } from '@shiftspace/renderer-core';
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
          </div>
        )}
      </div>
    </div>
  );
}
