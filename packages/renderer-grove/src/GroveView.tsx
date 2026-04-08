import type { WorktreeState } from '@shiftspace/renderer-core';
import { WorktreeCard } from './components/WorktreeCard';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';
import { useFlipLayout } from './useFlipLayout';

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
  const orderKey = worktrees.map((wt) => wt.id).join(',');
  const flipRef = useFlipLayout([orderKey]);

  return (
    <div className="w-full h-full overflow-auto">
      <div className="p-6">
        {worktrees.length === 0 ? (
          <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
        ) : (
          <div ref={flipRef} className="flex flex-row flex-wrap gap-4 items-start">
            {worktrees.map((wt) => (
              <div key={wt.id} data-flip-id={wt.id}>
                <ErrorBoundary
                  resetKey={`${wt.branch}:${wt.path}`}
                  fallback={<WorktreeCardError />}
                >
                  <WorktreeCard worktree={wt} />
                </ErrorBoundary>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
