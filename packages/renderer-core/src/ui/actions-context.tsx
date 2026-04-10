import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { DiffMode } from '../types';

/**
 * All user-initiated actions that flow from the renderer to the host
 * (VSCode extension or preview app). This replaces 18+ callback props
 * that were drilled through 4 component layers.
 *
 * Components call `useActions().fileClick(id, path)` instead of
 * receiving `onFileClick` as a prop.
 */
export interface ShiftspaceActions {
  fileClick: (worktreeId: string, filePath: string, line?: number) => void;
  folderClick: (worktreeId: string, folderPath: string) => void;
  diffModeChange: (worktreeId: string, diffMode: DiffMode) => void;
  requestBranchList: (worktreeId: string) => void;
  checkoutBranch: (worktreeId: string, branch: string) => void;
  fetchBranches: (worktreeId: string) => void;
  swapBranches: (worktreeId: string) => void;
  addWorktree: () => void;
  removeWorktree: (worktreeId: string) => void;
  renameWorktree: (worktreeId: string, newName: string) => void;
  runAction: (worktreeId: string, actionId: string) => void;
  stopAction: (worktreeId: string, actionId: string) => void;
  runPipeline: (worktreeId: string, pipelineId: string) => void;
  getLog: (worktreeId: string, actionId: string) => void;
  recheckInsights: (worktreeId: string) => void;
  cancelInsights: (worktreeId: string) => void;
  setPackage: (packageName: string) => void;
  detectPackages: () => void;
}

const DEFAULT_ACTIONS: ShiftspaceActions = {
  fileClick: () => {},
  folderClick: () => {},
  diffModeChange: () => {},
  requestBranchList: () => {},
  checkoutBranch: () => {},
  fetchBranches: () => {},
  swapBranches: () => {},
  addWorktree: () => {},
  removeWorktree: () => {},
  renameWorktree: () => {},
  runAction: () => {},
  stopAction: () => {},
  runPipeline: () => {},
  getLog: () => {},
  recheckInsights: () => {},
  cancelInsights: () => {},
  setPackage: () => {},
  detectPackages: () => {},
};

const ActionsContext = createContext<ShiftspaceActions>(DEFAULT_ACTIONS);

/**
 * Hook to access all Shiftspace actions from any descendant component.
 */
export function useActions(): ShiftspaceActions {
  return useContext(ActionsContext);
}

/** Raw callback props accepted by the provider (matches ShiftspaceRenderer's existing API). */
interface ActionsProviderProps {
  onFileClick?: (worktreeId: string, filePath: string, line?: number) => void;
  onFolderClick?: (worktreeId: string, folderPath: string) => void;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  onAddWorktree?: () => void;
  onRemoveWorktree?: (worktreeId: string) => void;
  onRenameWorktree?: (worktreeId: string, newName: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onGetLog?: (worktreeId: string, actionId: string) => void;
  onRecheckInsights?: (worktreeId: string) => void;
  onCancelInsights?: (worktreeId: string) => void;
  onSetPackage?: (packageName: string) => void;
  onDetectPackages?: () => void;
  children: ReactNode;
}

/**
 * Provides action dispatchers to the entire component tree.
 *
 * With the React 19 Compiler, the actions object is auto-memoized —
 * no manual ref indirection needed. The compiler tracks that the
 * dispatchers only depend on the callback props and skips re-creating
 * the object when they haven't changed.
 */
export function ActionsProvider({
  onFileClick,
  onFolderClick,
  onDiffModeChange,
  onRequestBranchList,
  onCheckoutBranch,
  onFetchBranches,
  onSwapBranches,
  onAddWorktree,
  onRemoveWorktree,
  onRenameWorktree,
  onRunAction,
  onStopAction,
  onRunPipeline,
  onGetLog,
  onRecheckInsights,
  onCancelInsights,
  onSetPackage,
  onDetectPackages,
  children,
}: ActionsProviderProps) {
  const actions: ShiftspaceActions = useMemo(
    () => ({
      fileClick: (a, b, c) => onFileClick?.(a, b, c),
      folderClick: (a, b) => onFolderClick?.(a, b),
      diffModeChange: (a, b) => onDiffModeChange?.(a, b),
      requestBranchList: (a) => onRequestBranchList?.(a),
      checkoutBranch: (a, b) => onCheckoutBranch?.(a, b),
      fetchBranches: (a) => onFetchBranches?.(a),
      swapBranches: (a) => onSwapBranches?.(a),
      addWorktree: () => onAddWorktree?.(),
      removeWorktree: (a) => onRemoveWorktree?.(a),
      renameWorktree: (a, b) => onRenameWorktree?.(a, b),
      runAction: (a, b) => onRunAction?.(a, b),
      stopAction: (a, b) => onStopAction?.(a, b),
      runPipeline: (a, b) => onRunPipeline?.(a, b),
      getLog: (a, b) => onGetLog?.(a, b),
      recheckInsights: (a) => onRecheckInsights?.(a),
      cancelInsights: (a) => onCancelInsights?.(a),
      setPackage: (a) => onSetPackage?.(a),
      detectPackages: () => onDetectPackages?.(),
    }),
    [
      onFileClick,
      onFolderClick,
      onDiffModeChange,
      onRequestBranchList,
      onCheckoutBranch,
      onFetchBranches,
      onSwapBranches,
      onAddWorktree,
      onRemoveWorktree,
      onRenameWorktree,
      onRunAction,
      onStopAction,
      onRunPipeline,
      onGetLog,
      onRecheckInsights,
      onCancelInsights,
      onSetPackage,
      onDetectPackages,
    ]
  );

  return <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>;
}
