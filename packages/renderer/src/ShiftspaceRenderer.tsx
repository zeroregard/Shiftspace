import React, { Suspense, useEffect } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { WorktreeState, ShiftspaceEvent, DiffMode } from './types';
import { useWorktreeStore } from './store';
import { useInspectionStore } from './store';
import { type PanZoomConfig } from './TreeCanvas';
import { GroveView } from './views/grove';
import { PackageSwitcher } from './shared/PackageSwitcher';
import { ActionsProvider, useActions } from './ui/ActionsContext';

const LazyInspectionView = React.lazy(() =>
  import('./views/inspection').then((m) => ({ default: m.InspectionView }))
);

interface Props {
  initialWorktrees?: WorktreeState[];
  onEvent?: (handler: (event: ShiftspaceEvent) => void) => () => void;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onTerminalOpen?: (worktreeId: string) => void;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFolderClick?: (worktreeId: string, folderPath: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  onRemoveWorktree?: (worktreeId: string) => void;
  onRenameWorktree?: (worktreeId: string, newName: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onSetPackage?: (packageName: string) => void;
  onDetectPackages?: () => void;
  onGetLog?: (worktreeId: string, actionId: string) => void;
  onRecheckInsights?: (worktreeId: string) => void;
  panZoomConfig?: PanZoomConfig;
}

export { type PanZoomConfig };

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

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
  onRemoveWorktree,
  onRenameWorktree,
  onRunPipeline,
  onSetPackage,
  onDetectPackages,
  onGetLog,
  onRecheckInsights,
  panZoomConfig,
}) => {
  const { setWorktrees, applyEvent } = useWorktreeStore();

  useEffect(() => {
    if (initialWorktrees.length > 0) setWorktrees(initialWorktrees);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      onRemoveWorktree={onRemoveWorktree}
      onRenameWorktree={onRenameWorktree}
      onRunAction={onRunAction}
      onStopAction={onStopAction}
      onRunPipeline={onRunPipeline}
      onGetLog={onGetLog}
      onRecheckInsights={onRecheckInsights}
      onSetPackage={onSetPackage}
      onDetectPackages={onDetectPackages}
    >
      <RadixTooltip.Provider delayDuration={300}>
        <ShiftspaceContent showPackageSwitcher={!!onSetPackage} panZoomConfig={panZoomConfig} />
      </RadixTooltip.Provider>
    </ActionsProvider>
  );
};

// ---------------------------------------------------------------------------
// Inner content — consumes actions from context, no prop drilling
// ---------------------------------------------------------------------------

interface ContentProps {
  showPackageSwitcher: boolean;
  panZoomConfig?: PanZoomConfig;
}

function ShiftspaceContent({ showPackageSwitcher, panZoomConfig }: ContentProps) {
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const mode = useInspectionStore((s) => s.mode);
  const actions = useActions();

  const wtArray = Array.from(worktrees.values()).sort((a, b) => {
    if (a.isMainWorktree && !b.isMainWorktree) return -1;
    if (!a.isMainWorktree && b.isMainWorktree) return 1;
    const nameA = (a.path.split('/').filter(Boolean).pop() ?? a.path).toLowerCase();
    const nameB = (b.path.split('/').filter(Boolean).pop() ?? b.path).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="w-full h-full bg-canvas flex flex-col relative">
      {showPackageSwitcher && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-dashed shrink-0">
          <PackageSwitcher
            onSetPackage={actions.setPackage}
            onDetectPackages={actions.detectPackages}
          />
        </div>
      )}
      <div className="flex-1 min-h-0">
        {mode.type === 'grove' ? (
          <GroveView worktrees={wtArray} />
        ) : (
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center text-text-faint text-13">
                Loading…
              </div>
            }
          >
            <LazyInspectionView worktreeId={mode.worktreeId} panZoomConfig={panZoomConfig} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
