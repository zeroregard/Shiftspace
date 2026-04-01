import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import type { DiffMode, FileChange } from '../../types';
import { useShiftspaceStore, getFileFindings } from '../../store';
import { TreeCanvas, type PanZoomConfig } from '../../TreeCanvas';
import { NODE_TYPES } from '../../nodes';
import { BranchPickerPopover } from '../../overlays/BranchPickerPopover';
import { Tooltip } from '../../overlays/Tooltip';
import { ThemedFileIcon } from '../../shared/ThemedFileIcon';
import { InspectionHoverContext } from '../../shared/InspectionHoverContext';
import { GitCompareIcon, GitBranchIcon } from '../../icons';
import {
  partitionFiles,
  filterFilesByQuery,
  getAllFilteredFiles,
  isValidRegex,
} from '../../utils/listSections';
import { computeSingleWorktreeLayout } from '../../layout';
import { filterCheckoutableBranches } from '../../utils/worktreeUtils';
import { CheckBar } from './components/CheckBar';

const EMPTY_BRANCHES: string[] = [];

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

// TODO: remove this
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
  onHoverFile?: (filePath: string | null) => void;
}

const InspectionFileRow = React.memo(
  ({ file, worktreeId, onFileClick, onHoverFile }: InspectionFileRowProps) => {
    const parts = file.path.split('/');
    const fileName = parts.pop() ?? file.path;
    const dirPath = parts.join('/');
    const isDeleted = file.status === 'deleted';

    const findings = useShiftspaceStore(
      useShallow((s) => getFileFindings(s.insightDetails, worktreeId, file.path))
    );
    const totalFindings = findings.length;

    return (
      <button
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors',
          'hover:bg-node-file-pulse',
          onFileClick ? 'cursor-pointer' : 'cursor-default'
        )}
        onClick={() => onFileClick?.(worktreeId, file.path)}
        onMouseEnter={() => onHoverFile?.(file.path)}
        onMouseLeave={() => onHoverFile?.(null)}
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

        {/* Smell pill */}
        {totalFindings > 0 && (
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5">
                {findings.map((f) => (
                  <span key={f.ruleId}>
                    {f.threshold === 1
                      ? `${f.ruleLabel}: ${f.count} found`
                      : `${f.ruleLabel}: 1 found (${f.count} occurrences, threshold: ${f.threshold})`}
                  </span>
                ))}
              </div>
            }
            delayDuration={200}
          >
            <span className="text-10 text-status-modified font-medium shrink-0 px-1 py-0.5 rounded border border-status-modified/30 bg-status-modified/10">
              ⚠ {totalFindings}
            </span>
          </Tooltip>
        )}

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
    const insightDetails = useShiftspaceStore((s) => s.insightDetails);
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

    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);

    const searchRegexError = useMemo(() => !isValidRegex(searchQuery), [searchQuery]);

    // Clear filter and hover when switching worktrees
    useEffect(() => {
      setSearchQuery('');
      setHoveredFilePath(null);
    }, [worktreeId]);

    // Compute the combined file list for the hierarchy panel (must match list panel).
    // In branch diff mode, include branchFiles + staged + unstaged.
    // Apply search filter so hierarchy matches the list panel.
    const hierarchyFiles = useMemo(
      () => (wt ? getAllFilteredFiles(wt, searchQuery) : []),
      [wt, searchQuery]
    );

    // Compute tree layout for the tree panel
    const { nodes, edges } = useMemo(() => {
      if (!wt) return { nodes: [], edges: [] };
      const layout = computeSingleWorktreeLayout(
        wt,
        stableFileClick,
        stableRequestBranchList,
        stableCheckoutBranch,
        stableFolderClick,
        stableFetchBranches,
        stableSwapBranches,
        { bare: true, filesOverride: hierarchyFiles },
        (wtId, filePath) => getFileFindings(insightDetails, wtId, filePath).length
      );
      return { nodes: layout.nodes, edges: layout.edges };
    }, [
      wt,
      hierarchyFiles,
      insightDetails,
      stableFileClick,
      stableRequestBranchList,
      stableCheckoutBranch,
      stableFolderClick,
      stableFetchBranches,
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

    const hoverContextValue = useMemo(() => ({ hoveredFilePath }), [hoveredFilePath]);

    const filteredCommitted = useMemo(
      () => filterFilesByQuery(committed, searchQuery),
      [committed, searchQuery]
    );
    const filteredStaged = useMemo(
      () => filterFilesByQuery(staged, searchQuery),
      [staged, searchQuery]
    );
    const filteredUnstaged = useMemo(
      () => filterFilesByQuery(unstaged, searchQuery),
      [unstaged, searchQuery]
    );
    const totalFileCount = committed.length + staged.length + unstaged.length;
    const filteredFileCount =
      filteredCommitted.length + filteredStaged.length + filteredUnstaged.length;
    const isEmpty = filteredFileCount === 0;

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
          <div className="min-[600px]:w-[35%] min-[600px]:max-w-sm border-b min-[600px]:border-b-0 min-[600px]:border-r border-border-dashed flex flex-col shrink-0">
            {/* Search filter */}
            <div className="px-2 pt-2 pb-1 shrink-0">
              <div className="relative">
                <i
                  className="codicon codicon-search absolute left-2 top-1/2 -translate-y-1/2 text-text-faint"
                  style={{ fontSize: 12 }}
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter files"
                  className={clsx(
                    'w-full pl-7 pr-7 py-1.5 rounded-md text-11 bg-node-file border outline-none transition-colors text-text-primary placeholder:text-text-faint',
                    searchRegexError
                      ? 'border-status-deleted'
                      : 'border-border-dashed focus:border-text-muted'
                  )}
                />
                {searchQuery && (
                  <button
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-primary cursor-pointer bg-transparent border-none p-0"
                    onClick={() => setSearchQuery('')}
                  >
                    <i
                      className="codicon codicon-close"
                      style={{ fontSize: 12 }}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
              {searchQuery && (
                <div className="text-10 text-text-faint px-1 pt-1">
                  {filteredFileCount} / {totalFileCount} files
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 pt-0">
              {isEmpty ? (
                <div className="text-text-faint text-11 px-3 py-2">
                  {searchQuery ? 'No matching files' : 'No changes'}
                </div>
              ) : (
                <>
                  {filteredCommitted.length > 0 && (
                    <>
                      <SectionLabel label="Committed" />
                      {filteredCommitted.map((file) => (
                        <InspectionFileRow
                          key={`committed:${file.path}`}
                          file={file}
                          worktreeId={wt.id}
                          onFileClick={onFileClick}
                          onHoverFile={setHoveredFilePath}
                        />
                      ))}
                    </>
                  )}
                  {filteredStaged.length > 0 && (
                    <>
                      <SectionLabel label="Staged" />
                      {filteredStaged.map((file) => (
                        <InspectionFileRow
                          key={`staged:${file.path}`}
                          file={file}
                          worktreeId={wt.id}
                          onFileClick={onFileClick}
                          onHoverFile={setHoveredFilePath}
                        />
                      ))}
                    </>
                  )}
                  {filteredUnstaged.length > 0 && (
                    <>
                      <SectionLabel label="Unstaged" />
                      {filteredUnstaged.map((file) => (
                        <InspectionFileRow
                          key={`unstaged:${file.path}`}
                          file={file}
                          worktreeId={wt.id}
                          onFileClick={onFileClick}
                          onHoverFile={setHoveredFilePath}
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
            <InspectionHoverContext.Provider value={hoverContextValue}>
              <TreeCanvas
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                panZoomConfig={panZoomConfig}
              />
            </InspectionHoverContext.Provider>
          </div>
        </div>
      </div>
    );
  }
);

InspectionView.displayName = 'InspectionView';
