import type { WorktreeState } from '../../types';
import { WorktreeCard } from './components/WorktreeCard';

interface GroveViewProps {
  worktrees: WorktreeState[];
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
              <WorktreeCard key={wt.id} worktree={wt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
