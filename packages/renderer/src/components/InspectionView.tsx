import React, { useMemo, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import type { DiffMode, FileChange } from '../types';
import { useShiftspaceStore } from '../store';
import { TreeCanvas, type PanZoomConfig } from '../TreeCanvas';
import { NODE_TYPES } from './index';
import { BranchPickerPopover } from './BranchPickerPopover';
import { DiffPopover } from './DiffOverlay';
import { ThemedFileIcon } from './ThemedFileIcon';
import { GitCompareIcon, GitBranchIcon } from '../icons';
import { partitionFiles } from '../utils/listSections';
import { computeSingleWorktreeLayout } from '../layout';
import { filterCheckoutableBranches } from '../utils/worktreeUtils';
import { CheckBar } from './CheckBar';

const EMPTY_BRANCHES: string[] = [];

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

// ---------------------------------------------------------------------------
// File row (list panel)
// ---------------------------------------------------------------------------

const STATUS_LETTER: Record<FileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
};

const STATUS_COLOR_CLASS: Record<FileChange['status'], string> = {
  added: 'text-status-added',
  modified: 'text-status-modified',
  deleted: 'text-status-deleted',
};

interface InspectionFileRowProps {
  file: FileChange;
  worktreeId: string;
  onFileClick?: (worktreeId: string, filePath: string) => void;
}

const InspectionFileRow = React.memo(
  ({ file, worktreeId, onFileClick }: InspectionFileRowProps) => {
    const parts = file.path.split('/');
    const fileName = parts.pop() ?? file.path;
    const dirPath = parts.join('/');
    const isDeleted = file.status === 'deleted';

    return (
      <DiffPopover file={file}>
        <button
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors',
            'hover:bg-node-file-pulse',
            onFileClick ? 'cursor-pointer' : 'cursor-default'
          )}
          onClick={() => onFileClick?.(worktreeId, file.path)}
        >
          {/* File icon */}
          <span className="shrink-0 flex items-center">
            <ThemedFileIcon filePath={file.path} size={16} />
          </span>

          {/* Filename + directory */}
          <span className="text-11 flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
            <span
              className={clsx(
                'shrink-0',
                isDeleted ? 'text-status-deleted line-through' : 'text-text-primary'
              )}
            >
              {fileName}
            </span>
            {dirPath && (
              <span className="text-text-muted overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                {dirPath}
              </span>
            )}
          </span>

          {/* Status letter */}
          <span
            className={clsx(
              'text-11 font-mono font-semibold w-3 shrink-0',
              STATUS_COLOR_CLASS[file.status]
            )}
          >
            {STATUS_LETTER[file.status]}
          </span>
        </button>
      </DiffPopover>
    );
  }
);

InspectionFileRow.displayName = 'InspectionFileRow';

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
      <span className="text-10 font-semibold uppercase tracking-wider text-text-faint">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main InspectionView
// ---------------------------------------------------------------------------

interface InspectionViewProps {
  worktreeId: string;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onDiffModeChange?: (worktreeId: string, diffMode: DiffMode) => void;
  onRequestBranchList?: (worktreeId: string) => void;
  onCheckoutBranch?: (worktreeId: string, branch: string) => void;
  onFolderClick?: (worktreeId: string, folderPath: string) => void;
  onFetchBranches?: (worktreeId: string) => void;
  onRunAction?: (worktreeId: string, actionId: string) => void;
  onStopAction?: (worktreeId: string, actionId: string) => void;
  onSwapBranches?: (worktreeId: string) => void;
  onRunPipeline?: (worktreeId: string, pipelineId: string) => void;
  onGetLog?: (worktreeId: string, actionId: string) => void;
  panZoomConfig?: PanZoomConfig;
}

export const InspectionView = React.memo(
  ({
    worktreeId,
    onFileClick,
    onDiffModeChange,
    onRequestBranchList,
    onCheckoutBranch,
    onFolderClick,
    onFetchBranches,
    onRunAction,
    onStopAction,
    onSwapBranches,
    onRunPipeline,
    onGetLog,
    panZoomConfig,
  }: InspectionViewProps) => {
    const exitInspection = useShiftspaceStore((s) => s.exitInspection);
    const wt = useShiftspaceStore((s) => s.worktrees.get(worktreeId));
    const actionConfigs = useShiftspaceStore((s) => s.actionConfigs);
    const branchList = useShiftspaceStore((s) => s.branchLists.get(worktreeId) ?? EMPTY_BRANCHES);
    const isLoading = useShiftspaceStore((s) => s.diffModeLoading.has(worktreeId));
    const isFetchingBranches = useShiftspaceStore((s) => s.fetchLoading.has(worktreeId));
    const lastFetchAt = useShiftspaceStore((s) => s.lastFetchAt.get(worktreeId));
    const occupiedBranches = useShiftspaceStore(
      useShallow((s) => Array.from(s.worktrees.values()).map((w) => w.branch))
    );

    // Stable callback refs for layout
    const fileClickRef = useRef(onFileClick);
    fileClickRef.current = onFileClick;
    const stableFileClick = useCallback(
      (wtId: string, path: string) => fileClickRef.current?.(wtId, path),
      []
    );

    const diffModeChangeRef = useRef(onDiffModeChange);
    diffModeChangeRef.current = onDiffModeChange;
    const stableDiffModeChange = useCallback(
      (wtId: string, mode: DiffMode) => diffModeChangeRef.current?.(wtId, mode),
      []
    );

    const requestBranchListRef = useRef(onRequestBranchList);
    requestBranchListRef.current = onRequestBranchList;
    const stableRequestBranchList = useCallback(
      (wtId: string) => requestBranchListRef.current?.(wtId),
      []
    );

    const checkoutBranchRef = useRef(onCheckoutBranch);
    checkoutBranchRef.current = onCheckoutBranch;
    const stableCheckoutBranch = useCallback(
      (wtId: string, branch: string) => checkoutBranchRef.current?.(wtId, branch),
      []
    );

    const folderClickRef = useRef(onFolderClick);
    folderClickRef.current = onFolderClick;
    const stableFolderClick = useCallback(
      (wtId: string, path: string) => folderClickRef.current?.(wtId, path),
      []
    );

    const fetchBranchesRef = useRef(onFetchBranches);
    fetchBranchesRef.current = onFetchBranches;
    const stableFetchBranches = useCallback((wtId: string) => fetchBranchesRef.current?.(wtId), []);

    const runActionRef = useRef(onRunAction);
    runActionRef.current = onRunAction;
    const stableRunAction = useCallback(
      (wtId: string, actionId: string) => runActionRef.current?.(wtId, actionId),
      []
    );

    const stopActionRef = useRef(onStopAction);
    stopActionRef.current = onStopAction;
    const stableStopAction = useCallback(
      (wtId: string, actionId: string) => stopActionRef.current?.(wtId, actionId),
      []
    );

    const swapBranchesRef = useRef(onSwapBranches);
    swapBranchesRef.current = onSwapBranches;
    const stableSwapBranches = useCallback((wtId: string) => swapBranchesRef.current?.(wtId), []);

    // Compute tree layout for the tree panel
    const numActions = actionConfigs.length;
    const { nodes, edges } = useMemo(() => {
      if (!wt) return { nodes: [], edges: [] };
      const layout = computeSingleWorktreeLayout(
        wt,
        stableFileClick,
        stableRequestBranchList,
        stableCheckoutBranch,
        stableFolderClick,
        stableFetchBranches,
        stableRunAction,
        stableStopAction,
        numActions,
        stableSwapBranches
      );
      return { nodes: layout.nodes, edges: layout.edges };
    }, [
      wt,
      numActions,
      stableFileClick,
      stableRequestBranchList,
      stableCheckoutBranch,
      stableFolderClick,
      stableFetchBranches,
      stableRunAction,
      stableStopAction,
      stableSwapBranches,
    ]);

    if (!wt) {
      return (
        <div className="w-full h-full flex items-center justify-center text-text-faint text-13">
          Worktree not found
        </div>
      );
    }

    const diffMode: DiffMode = wt.diffMode ?? { type: 'working' };
    const defaultBranch = wt.defaultBranch ?? 'main';
    const modeLabel = diffMode.type === 'working' ? 'Working changes' : `vs ${diffMode.branch}`;

    const diffModeStaticOptions = [
      {
        key: 'working',
        label: 'Working changes',
        selected: diffMode.type === 'working',
        onSelect: () => onDiffModeChange?.(wt.id, { type: 'working' }),
      },
      ...(branchList.includes(defaultBranch) || !defaultBranch
        ? []
        : [
            {
              key: `default-${defaultBranch}`,
              label: `vs ${defaultBranch}`,
              selected: isDiffModeEqual(diffMode, { type: 'branch', branch: defaultBranch }),
              onSelect: () => onDiffModeChange?.(wt.id, { type: 'branch', branch: defaultBranch }),
            },
          ]),
    ];

    const diffModeBranches = branchList.filter((b) => b !== wt.branch);
    const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);

    const { committed, staged, unstaged } = partitionFiles(wt);
    const isEmpty = committed.length === 0 && staged.length === 0 && unstaged.length === 0;

    return (
      <div className="w-full h-full flex flex-col bg-canvas">
        {/* Header bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-dashed shrink-0">
          {/* Back button */}
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted text-11 cursor-pointer bg-transparent transition-colors"
            onClick={exitInspection}
          >
            <i className="codicon codicon-arrow-left" style={{ fontSize: 11 }} aria-hidden="true" />
            Back
          </button>

          {/* Worktree / branch name */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BranchPickerPopover
              trigger={
                <button
                  className="flex items-center gap-1 text-text-primary hover:text-text-primary cursor-pointer bg-transparent border-none p-0 text-13 font-semibold truncate"
                  title="Switch branch"
                >
                  <GitBranchIcon />
                  {wt.branch}
                </button>
              }
              branches={checkoutBranches}
              selectedBranch={wt.branch}
              onSelectBranch={(branch) => onCheckoutBranch?.(wt.id, branch)}
              onOpen={() => onRequestBranchList?.(wt.id)}
              onFetch={onFetchBranches ? () => onFetchBranches!(wt.id) : undefined}
              isFetching={isFetchingBranches}
              lastFetchAt={lastFetchAt}
            />
          </div>

          {/* Diff mode dropdown */}
          <BranchPickerPopover
            trigger={
              <button className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-text-muted text-10 whitespace-nowrap cursor-pointer bg-transparent">
                <GitCompareIcon />
                <span style={{ opacity: isLoading ? 0.5 : 1 }}>{modeLabel}</span>
              </button>
            }
            branches={diffModeBranches}
            selectedBranch={diffMode.type === 'branch' ? diffMode.branch : null}
            staticOptions={diffModeStaticOptions}
            branchLabel={(b) => `vs ${b}`}
            onSelectBranch={(branch) => onDiffModeChange?.(wt.id, { type: 'branch', branch })}
            onOpen={() => onRequestBranchList?.(wt.id)}
          />
        </div>

        {/* Check bar */}
        {actionConfigs.length > 0 && (
          <CheckBar
            worktreeId={worktreeId}
            onRunAction={stableRunAction}
            onStopAction={stableStopAction}
            onRunPipeline={onRunPipeline}
            onGetLog={onGetLog}
          />
        )}

        {/* Split panels */}
        <div className="flex-1 min-h-0 flex flex-col min-[600px]:flex-row">
          {/* List panel (~35%) */}
          <div className="min-[600px]:w-[35%] min-[600px]:max-w-sm border-b min-[600px]:border-b-0 min-[600px]:border-r border-border-dashed overflow-y-auto shrink-0">
            <div className="p-2">
              {isEmpty ? (
                <div className="text-text-faint text-11 px-3 py-2">No changes</div>
              ) : (
                <>
                  {committed.length > 0 && (
                    <>
                      <SectionLabel label="Committed" />
                      {committed.map((file) => (
                        <InspectionFileRow
                          key={file.path}
                          file={file}
                          worktreeId={wt.id}
                          onFileClick={onFileClick}
                        />
                      ))}
                    </>
                  )}
                  {staged.length > 0 && (
                    <>
                      <SectionLabel label="Staged" />
                      {staged.map((file) => (
                        <InspectionFileRow
                          key={file.path}
                          file={file}
                          worktreeId={wt.id}
                          onFileClick={onFileClick}
                        />
                      ))}
                    </>
                  )}
                  {unstaged.length > 0 && (
                    <>
                      <SectionLabel label="Unstaged" />
                      {unstaged.map((file) => (
                        <InspectionFileRow
                          key={file.path}
                          file={file}
                          worktreeId={wt.id}
                          onFileClick={onFileClick}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tree panel (~65%) */}
          <div className="flex-1 min-h-0 min-w-0 relative">
            <TreeCanvas
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              panZoomConfig={panZoomConfig}
            />
          </div>
        </div>
      </div>
    );
  }
);

InspectionView.displayName = 'InspectionView';
