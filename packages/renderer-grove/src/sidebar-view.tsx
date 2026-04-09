import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import type { WorktreeState } from '@shiftspace/renderer-core';
import { useWorktreeStore, useActions } from '@shiftspace/renderer-core';
import { WorktreeCard } from './components/worktree-card';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';
import { Loader } from '@shiftspace/ui/loader';

interface SidebarViewProps {
  worktrees: WorktreeState[];
  /** Called when a worktree card is clicked. The host should open/focus a Shiftspace tab with inspection for this worktree. */
  onWorktreeClick?: (worktreeId: string) => void;
}

function WorktreeCardError() {
  return (
    <div className="w-full flex items-center justify-center p-4 rounded-xl border-2 border-dashed border-status-deleted/30 text-text-faint text-11">
      Failed to render worktree
    </div>
  );
}

export function SidebarView({ worktrees, onWorktreeClick }: SidebarViewProps) {
  const initialized = useWorktreeStore((s) => s.initialized);
  const actions = useActions();

  if (!initialized) {
    return (
      <div className="w-full h-full">
        <Loader />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto">
      <div className="p-3">
        {worktrees.length === 0 ? (
          <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
        ) : (
          <LayoutGroup>
            <div className="flex flex-col gap-3">
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
                      <WorktreeCard
                        worktree={wt}
                        variant="slim"
                        onWorktreeClick={onWorktreeClick}
                      />
                    </ErrorBoundary>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}
        <button
          className="w-full mt-3 h-8 flex items-center justify-center rounded-xl border-2 border-dashed border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default bg-transparent cursor-pointer transition-colors"
          onClick={() => actions.addWorktree()}
          aria-label="Add worktree"
          data-testid="add-worktree"
        >
          <i className="codicon codicon-add" style={{ fontSize: 14 }} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
