import React, { Suspense, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { WorktreeState, ShiftspaceEvent, DiffMode } from '@shiftspace/renderer-core';
import { useWorktreeStore, useInspectionStore } from '@shiftspace/renderer-core';
import { type PanZoomConfig } from '@shiftspace/renderer-core';
import { GroveView } from '@shiftspace/renderer-grove';
import { UnifiedHeader, ActionsProvider } from '@shiftspace/renderer-core';
import { Loader } from '@shiftspace/ui/loader';

const LazyInspectionView = React.lazy(() =>
  import('@shiftspace/renderer-inspection').then((m) => ({ default: m.InspectionView }))
);

interface Props {
  initialWorktrees?: WorktreeState[];
  onEvent?: (handler: (event: ShiftspaceEvent) => void) => () => void;
  onFileClick?: (worktreeId: string, filePath: string, line?: number) => void;
  onTerminalOpen?: (worktreeId: string) => void;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFolderClick?: (worktreeId: string, folderPath: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  onAddWorktree?: () => void;
  onRemoveWorktree?: (worktreeId: string) => void;
  onRenameWorktree?: (worktreeId: string, newName: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onSetPackage?: (packageName: string) => void;
  onDetectPackages?: () => void;
  onGetLog?: (worktreeId: string, actionId: string) => void;
  onRecheckInsights?: (worktreeId: string) => void;
  onCancelInsights?: (worktreeId: string) => void;
  onSortChange?: (mode: string) => void;
  panZoomConfig?: PanZoomConfig;
}

export { type PanZoomConfig };

// Main renderer

export const ShiftspaceRenderer: React.FC<Props> = ({
  initialWorktrees = [],
  onEvent,
  onFileClick,
  onDiffModeChange,
  onRequestBranchList,
  onCheckoutBranch,
  onFolderClick,
  onFetchBranches,
  onRunAction,
  onStopAction,
  onSwapBranches,
  onAddWorktree,
  onRemoveWorktree,
  onRenameWorktree,
  onRunPipeline,
  onSetPackage,
  onDetectPackages,
  onGetLog,
  onRecheckInsights,
  onCancelInsights,
  onSortChange,
  panZoomConfig,
}) => {
  const { setWorktrees, applyEvent } = useWorktreeStore();

  useEffect(() => {
    if (initialWorktrees.length > 0) setWorktrees(initialWorktrees);
  }, []);

  useEffect(() => {
    if (!onEvent) return;
    return onEvent(applyEvent);
  }, [onEvent, applyEvent]);

  return (
    <ActionsProvider
      onFileClick={onFileClick}
      onFolderClick={onFolderClick}
      onDiffModeChange={onDiffModeChange}
      onRequestBranchList={onRequestBranchList}
      onCheckoutBranch={onCheckoutBranch}
      onFetchBranches={onFetchBranches}
      onSwapBranches={onSwapBranches}
      onAddWorktree={onAddWorktree}
      onRemoveWorktree={onRemoveWorktree}
      onRenameWorktree={onRenameWorktree}
      onRunAction={onRunAction}
      onStopAction={onStopAction}
      onRunPipeline={onRunPipeline}
      onGetLog={onGetLog}
      onRecheckInsights={onRecheckInsights}
      onCancelInsights={onCancelInsights}
      onSetPackage={onSetPackage}
      onDetectPackages={onDetectPackages}
    >
      <RadixTooltip.Provider delayDuration={0} skipDelayDuration={0}>
        <ShiftspaceContent
          showPackageSwitcher={!!onSetPackage}
          onSortChange={onSortChange}
          panZoomConfig={panZoomConfig}
        />
      </RadixTooltip.Provider>
    </ActionsProvider>
  );
};

// Inner content — consumes actions from context, no prop drilling

interface ContentProps {
  showPackageSwitcher: boolean;
  onSortChange?: (mode: string) => void;
  panZoomConfig?: PanZoomConfig;
}

function ShiftspaceContent({ showPackageSwitcher, onSortChange, panZoomConfig }: ContentProps) {
  // useShallow compares Map entries by reference — only re-renders when a
  // worktree is actually added, removed, or replaced (not on every event).
  const worktrees = useWorktreeStore(useShallow((s) => s.worktrees));
  const initialized = useWorktreeStore((s) => s.initialized);
  const mode = useInspectionStore((s) => s.mode);

  const wtArray = Array.from(worktrees.values());

  return (
    <div className="w-full h-full bg-canvas flex flex-col relative">
      <UnifiedHeader showPackageSwitcher={showPackageSwitcher} onSortChange={onSortChange} />
      <div className="flex-1 min-h-0">
        {!initialized ? (
          <Loader />
        ) : mode.type === 'grove' ? (
          <GroveView worktrees={wtArray} />
        ) : (
          <Suspense fallback={<Loader />}>
            <LazyInspectionView worktreeId={mode.worktreeId} panZoomConfig={panZoomConfig} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
