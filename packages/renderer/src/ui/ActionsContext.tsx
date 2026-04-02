import React, { createContext, useContext, useRef } from 'react';
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
  fileClick: (worktreeId: string, filePath: string) => void;
  folderClick: (worktreeId: string, folderPath: string) => void;
  diffModeChange: (worktreeId: string, diffMode: DiffMode) => void;
  requestBranchList: (worktreeId: string) => void;
  checkoutBranch: (worktreeId: string, branch: string) => void;
  fetchBranches: (worktreeId: string) => void;
  swapBranches: (worktreeId: string) => void;
  removeWorktree: (worktreeId: string) => void;
  renameWorktree: (worktreeId: string, newName: string) => void;
  runAction: (worktreeId: string, actionId: string) => void;
  stopAction: (worktreeId: string, actionId: string) => void;
  runPipeline: (worktreeId: string, pipelineId: string) => void;
  getLog: (worktreeId: string, actionId: string) => void;
  recheckInsights: (worktreeId: string) => void;
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
  removeWorktree: () => {},
  renameWorktree: () => {},
  runAction: () => {},
  stopAction: () => {},
  runPipeline: () => {},
  getLog: () => {},
  recheckInsights: () => {},
  setPackage: () => {},
  detectPackages: () => {},
};

const ActionsContext = createContext<ShiftspaceActions>(DEFAULT_ACTIONS);

/**
 * Hook to access all Shiftspace actions from any descendant component.
 * The returned object is referentially stable — safe to use in dependency arrays.
 */
export function useActions(): ShiftspaceActions {
  return useContext(ActionsContext);
}

/** Raw callback props accepted by the provider (matches ShiftspaceRenderer's existing API). */
export interface ActionsProviderProps {
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onFolderClick?: (worktreeId: string, folderPath: string) => void;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  onRemoveWorktree?: (worktreeId: string) => void;
  onRenameWorktree?: (worktreeId: string, newName: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onGetLog?: (worktreeId: string, actionId: string) => void;
  onRecheckInsights?: (worktreeId: string) => void;
  onSetPackage?: (packageName: string) => void;
  onDetectPackages?: () => void;
  children: React.ReactNode;
}

/**
 * Provides stable action dispatchers to the entire component tree.
 * Uses the ref+callback pattern to avoid re-renders when parent callbacks change.
 */
export function ActionsProvider({
  onFileClick,
  onFolderClick,
  onDiffModeChange,
  onRequestBranchList,
  onCheckoutBranch,
  onFetchBranches,
  onSwapBranches,
  onRemoveWorktree,
  onRenameWorktree,
  onRunAction,
  onStopAction,
  onRunPipeline,
  onGetLog,
  onRecheckInsights,
  onSetPackage,
  onDetectPackages,
  children,
}: ActionsProviderProps) {
  // Store all callbacks in a single ref to keep the context value stable
  const ref = useRef({
    onFileClick,
    onFolderClick,
    onDiffModeChange,
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onSwapBranches,
    onRemoveWorktree,
    onRenameWorktree,
    onRunAction,
    onStopAction,
    onRunPipeline,
    onGetLog,
    onRecheckInsights,
    onSetPackage,
    onDetectPackages,
  });

  // Update refs on every render (no re-render triggered)
  ref.current = {
    onFileClick,
    onFolderClick,
    onDiffModeChange,
    onRequestBranchList,
    onCheckoutBranch,
    onFetchBranches,
    onSwapBranches,
    onRemoveWorktree,
    onRenameWorktree,
    onRunAction,
    onStopAction,
    onRunPipeline,
    onGetLog,
    onRecheckInsights,
    onSetPackage,
    onDetectPackages,
  };

  // Stable dispatchers — they read from ref.current at call time.
  // The React Compiler auto-memoizes these since they only close over `ref` (a useRef).
  const actions: ShiftspaceActions = {
    fileClick: (a: string, b: string) => ref.current.onFileClick?.(a, b),
    folderClick: (a: string, b: string) => ref.current.onFolderClick?.(a, b),
    diffModeChange: (a: string, b: DiffMode) => ref.current.onDiffModeChange?.(a, b),
    requestBranchList: (a: string) => ref.current.onRequestBranchList?.(a),
    checkoutBranch: (a: string, b: string) => ref.current.onCheckoutBranch?.(a, b),
    fetchBranches: (a: string) => ref.current.onFetchBranches?.(a),
    swapBranches: (a: string) => ref.current.onSwapBranches?.(a),
    removeWorktree: (a: string) => ref.current.onRemoveWorktree?.(a),
    renameWorktree: (a: string, b: string) => ref.current.onRenameWorktree?.(a, b),
    runAction: (a: string, b: string) => ref.current.onRunAction?.(a, b),
    stopAction: (a: string, b: string) => ref.current.onStopAction?.(a, b),
    runPipeline: (a: string, b: string) => ref.current.onRunPipeline?.(a, b),
    getLog: (a: string, b: string) => ref.current.onGetLog?.(a, b),
    recheckInsights: (a: string) => ref.current.onRecheckInsights?.(a),
    setPackage: (a: string) => ref.current.onSetPackage?.(a),
    detectPackages: () => ref.current.onDetectPackages?.(),
  };

  return <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>;
}
