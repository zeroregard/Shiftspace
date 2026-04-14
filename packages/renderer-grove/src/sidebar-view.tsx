import { useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import type { WorktreeState } from '@shiftspace/renderer-core';
import { useWorktreeStore, useActions, sortWorktrees } from '@shiftspace/renderer-core';
import { WorktreeCard } from './components/worktree-card';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';
import { IconButton } from '@shiftspace/ui/icon-button';
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
  const sortMode = useWorktreeStore((s) => s.sortMode);
  const addingWorktree = useWorktreeStore((s) => s.addingWorktree);
  const actions = useActions();
  const sorted = useMemo(() => sortWorktrees(worktrees, sortMode), [worktrees, sortMode]);

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
                {sorted.map((wt) => (
                  <motion.div
                    key={wt.branch}
                    layout
                    layoutId={wt.branch}
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
        <div className="flex justify-center mt-3">
          {addingWorktree ? (
            <IconButton
              icon="loading"
              label="Adding worktree…"
              size="md"
              className="!w-10 !h-10 !rounded-xl !border-2 !border-dashed !border-border-dashed"
              iconSize={14}
              iconAnimation="spin 1s linear infinite"
              disabled
              data-testid="add-worktree"
            />
          ) : (
            <IconButton
              icon="add"
              label="Add worktree"
              size="md"
              className="!w-10 !h-10 !rounded-xl !border-2 !border-dashed !border-border-dashed hover:!border-border-default"
              iconSize={14}
              onClick={() => actions.addWorktree()}
              data-testid="add-worktree"
            />
          )}
        </div>
      </div>
    </div>
  );
}
