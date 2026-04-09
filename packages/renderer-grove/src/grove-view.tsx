import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import type { WorktreeState } from '@shiftspace/renderer-core';
import { WorktreeCard } from './components/worktree-card';
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
          <LayoutGroup>
            <div className="flex flex-row flex-wrap gap-4 items-start">
              <AnimatePresence>
                {worktrees.map((wt) => (
                  <motion.div
                    key={wt.id}
                    layout
                    layoutId={wt.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  >
                    <ErrorBoundary
                      resetKey={`${wt.branch}:${wt.path}`}
                      fallback={<WorktreeCardError />}
                    >
                      <WorktreeCard worktree={wt} />
                    </ErrorBoundary>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}
      </div>
    </div>
  );
}
