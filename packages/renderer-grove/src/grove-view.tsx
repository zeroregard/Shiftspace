import { useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import type { WorktreeState } from '@shiftspace/renderer-core';
import { useActions, useWorktreeStore, SortPicker, sortWorktrees } from '@shiftspace/renderer-core';
import { WorktreeCard } from './components/worktree-card';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';
import { IconButton } from '@shiftspace/ui/icon-button';

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
  const sortMode = useWorktreeStore((s) => s.sortMode);
  const sorted = useMemo(() => sortWorktrees(worktrees, sortMode), [worktrees, sortMode]);

  return (
    <div className="w-full h-full overflow-auto">
      <div className="p-6">
        {worktrees.length === 0 ? (
          <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
        ) : (
          <LayoutGroup>
            <div className="flex items-center gap-1 mb-3">
              <SortPicker />
            </div>
            <div className="flex flex-row flex-wrap gap-4 items-start">
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
                      <WorktreeCard worktree={wt} />
                    </ErrorBoundary>
                  </motion.div>
                ))}
              </AnimatePresence>
              <IconButton
                icon="add"
                label="Add worktree"
                size="md"
                className="self-center shrink-0 !w-10 !h-10 !rounded-xl !border-2 !border-dashed !border-border-dashed hover:!border-border-default"
                iconSize={14}
                onClick={() => actions.addWorktree()}
                data-testid="add-worktree"
              />
            </div>
          </LayoutGroup>
        )}
      </div>
    </div>
  );
}
