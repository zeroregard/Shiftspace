import React from 'react';
import type { WorktreeState, DiffMode } from '../types';
import { useDragPan } from '../hooks/useDragPan';
import { WorktreeHeader } from './WorktreeHeader';

interface SlimViewProps {
  worktrees: WorktreeState[];
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
}

export const SlimView = React.memo(
  ({
    worktrees,
    onDiffModeChange,
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onSwapBranches,
  }: SlimViewProps) => {
    const pan = useDragPan();
    return (
      <div
        ref={pan.containerRef}
        className="w-full h-full overflow-hidden select-none"
        style={{
          cursor: 'grab',
          backgroundImage: 'radial-gradient(circle, var(--color-grid-dot) 1px, transparent 1px)',
        }}
        onPointerDown={pan.onPointerDown}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.onPointerUp}
        onClickCapture={pan.onClickCapture}
      >
        <div ref={pan.translateRef}>
          <div ref={pan.contentRef} className="p-6">
            <div className="flex flex-row gap-4 items-start">
              {worktrees.map((wt) => (
                <div
                  key={wt.id}
                  className="min-w-72 px-4 py-2.5 border-2 border-dashed border-border-dashed rounded-xl bg-cluster-alpha text-text-primary"
                >
                  <WorktreeHeader
                    worktree={wt}
                    onDiffModeChange={onDiffModeChange}
                    onRequestBranchList={onRequestBranchList}
                    onCheckoutBranch={onCheckoutBranch}
                    onFetchBranches={onFetchBranches}
                    onSwapBranches={onSwapBranches}
                  />
                </div>
              ))}
              {worktrees.length === 0 && (
                <div className="text-text-faint text-13 text-center py-8">No worktrees</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

SlimView.displayName = 'SlimView';
