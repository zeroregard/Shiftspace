import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
import { useActions } from '../../ui/ActionsContext';
import { Badge } from '../../ui/Badge';
import { Codicon } from '../../ui/Codicon';
import { IconButton } from '../../ui/IconButton';
import { SectionLabel as SectionLabelPrimitive } from '../../ui/SectionLabel';

const EMPTY_BRANCHES: string[] = [];

function isDiffModeEqual(a: DiffMode, b: DiffMode): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'branch' && b.type === 'branch') return a.branch === b.branch;
  return true;
}

// ---------------------------------------------------------------------------
// File row (list panel)
// ---------------------------------------------------------------------------

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

    const diagnostics = useShiftspaceStore((s) =>
      s.fileDiagnostics.get(`${worktreeId}:${file.path}`)
    );
    const errors = diagnostics?.errors ?? 0;
    const warnings = diagnostics?.warnings ?? 0;

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

        {/* Annotation badges */}
        {(errors > 0 || warnings > 0 || totalFindings > 0) && (
          <span className="shrink-0 flex items-center gap-1">
            {errors > 0 && (
              <Tooltip
                content={
                  <div className="flex flex-col gap-0.5">
                    {diagnostics!.details
                      .filter((d) => d.severity === 'error')
                      .map((d, i) => (
                        <span key={i}>
                          L{d.line}: {d.message} ({d.source})
                        </span>
                      ))}
                  </div>
                }
                delayDuration={200}
              >
                <Badge variant="error">
                  <Codicon name="error" size={12} />
                  {errors}
                </Badge>
              </Tooltip>
            )}
            {warnings > 0 && (
              <Tooltip
                content={
                  <div className="flex flex-col gap-0.5">
                    {diagnostics!.details
                      .filter((d) => d.severity === 'warning')
                      .map((d, i) => (
                        <span key={i}>
                          L{d.line}: {d.message} ({d.source})
                        </span>
                      ))}
                  </div>
                }
                delayDuration={200}
              >
                <Badge variant="warning">
                  <Codicon name="warning" size={12} />
                  {warnings}
                </Badge>
              </Tooltip>
            )}
            {totalFindings > 0 && (
              <Tooltip
                content={
                  <div className="flex flex-col gap-0.5">
                    {findings.map((f) => (
                      <span key={f.ruleId}>
                        {f.ruleLabel}: {f.count} found
                      </span>
                    ))}
                  </div>
                }
                delayDuration={200}
              >
                <Badge variant="finding">
                  <Codicon name="debug-breakpoint-unsupported" size={12} />
                  {totalFindings}
                </Badge>
              </Tooltip>
            )}
          </span>
        )}
      </button>
    );
  }
);

InspectionFileRow.displayName = 'InspectionFileRow';

function FileSectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
      <SectionLabelPrimitive>{label}</SectionLabelPrimitive>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main InspectionView
// ---------------------------------------------------------------------------

interface InspectionViewProps {
  worktreeId: string;
  panZoomConfig?: PanZoomConfig;
}

export const InspectionView = React.memo(({ worktreeId, panZoomConfig }: InspectionViewProps) => {
  const actions = useActions();
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

  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  const handleFileRowClick = useCallback(
    (wtId: string, filePath: string) => {
      actions.fileClick(wtId, filePath);
      setFocusNodeId(`file-${wtId}-${filePath}`);
    },
    [actions]
  );

  const handleFocusComplete = useCallback(() => {
    setFocusNodeId(null);
  }, []);

  const searchRegexError = useMemo(() => !isValidRegex(searchQuery), [searchQuery]);

  // Clear filter, hover, and focus when switching worktrees
  useEffect(() => {
    setSearchQuery('');
    setFocusNodeId(null);
    setHoveredFilePath(null);
  }, [worktreeId]);

  const hierarchyFiles = useMemo(
    () => (wt ? getAllFilteredFiles(wt, searchQuery) : []),
    [wt, searchQuery]
  );

  // Compute tree layout — actions are stable (from context), so this won't re-compute spuriously
  const { nodes, edges } = useMemo(() => {
    if (!wt) return { nodes: [], edges: [] };
    const layout = computeSingleWorktreeLayout(
      wt,
      actions.fileClick,
      actions.folderClick,
      { bare: true, filesOverride: hierarchyFiles },
      (wtId, filePath) => getFileFindings(insightDetails, wtId, filePath).length
    );
    return { nodes: layout.nodes, edges: layout.edges };
  }, [wt, hierarchyFiles, insightDetails, actions]);

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
      onSelect: () => actions.diffModeChange(wt.id, { type: 'working' }),
    },
    ...(branchList.includes(defaultBranch) || !defaultBranch
      ? []
      : [
          {
            key: `default-${defaultBranch}`,
            label: `vs ${defaultBranch}`,
            selected: isDiffModeEqual(diffMode, { type: 'branch', branch: defaultBranch }),
            onSelect: () =>
              actions.diffModeChange(wt.id, { type: 'branch', branch: defaultBranch }),
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
        <IconButton icon="arrow-left" label="Back" onClick={exitInspection} iconSize={11} />

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
            onSelectBranch={(branch) => actions.checkoutBranch(wt.id, branch)}
            onOpen={() => actions.requestBranchList(wt.id)}
            onFetch={() => actions.fetchBranches(wt.id)}
            isFetching={isFetchingBranches}
            lastFetchAt={lastFetchAt}
          />
        </div>

        {/* Re-check insights */}
        <IconButton
          icon="refresh"
          label="Re-check insights"
          iconSize={11}
          onClick={() => actions.recheckInsights(worktreeId)}
        />

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
          onSelectBranch={(branch) => actions.diffModeChange(wt.id, { type: 'branch', branch })}
          onOpen={() => actions.requestBranchList(wt.id)}
        />
      </div>

      {/* Check bar */}
      {actionConfigs.length > 0 && <CheckBar worktreeId={worktreeId} />}

      {/* Split panels */}
      <div className="flex-1 min-h-0 flex flex-col min-[600px]:flex-row">
        {/* List panel (~35%) */}
        <div className="min-[600px]:w-[35%] min-[600px]:max-w-sm border-b min-[600px]:border-b-0 min-[600px]:border-r border-border-dashed flex flex-col shrink-0">
          {/* Search filter */}
          <div className="px-2 pt-2 pb-1 shrink-0">
            <div className="relative">
              <Codicon
                name="search"
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-text-faint"
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
                  <Codicon name="close" size={12} />
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
                    <FileSectionLabel label="Committed" />
                    {filteredCommitted.map((file) => (
                      <InspectionFileRow
                        key={`committed:${file.path}`}
                        file={file}
                        worktreeId={wt.id}
                        onFileClick={handleFileRowClick}
                        onHoverFile={setHoveredFilePath}
                      />
                    ))}
                  </>
                )}
                {filteredStaged.length > 0 && (
                  <>
                    <FileSectionLabel label="Staged" />
                    {filteredStaged.map((file) => (
                      <InspectionFileRow
                        key={`staged:${file.path}`}
                        file={file}
                        worktreeId={wt.id}
                        onFileClick={handleFileRowClick}
                        onHoverFile={setHoveredFilePath}
                      />
                    ))}
                  </>
                )}
                {filteredUnstaged.length > 0 && (
                  <>
                    <FileSectionLabel label="Unstaged" />
                    {filteredUnstaged.map((file) => (
                      <InspectionFileRow
                        key={`unstaged:${file.path}`}
                        file={file}
                        worktreeId={wt.id}
                        onFileClick={handleFileRowClick}
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
              focusNodeId={focusNodeId}
              onFocusComplete={handleFocusComplete}
            />
          </InspectionHoverContext.Provider>
        </div>
      </div>
    </div>
  );
});

InspectionView.displayName = 'InspectionView';
