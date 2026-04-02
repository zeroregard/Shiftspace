import React, { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useShiftspaceStore, getFileFindings } from '../../store';
import { TreeCanvas, type PanZoomConfig } from '../../TreeCanvas';
import { NODE_TYPES } from '../../nodes';
import { InspectionHoverContext } from '../../shared/InspectionHoverContext';
import { getAllFilteredFiles } from '../../utils/listSections';
import { computeSingleWorktreeLayout } from '../../layout';
import { filterCheckoutableBranches } from '../../utils/worktreeUtils';
import { CheckBar } from './components/CheckBar';
import { useActions } from '../../ui/ActionsContext';
import { InspectionHeader } from './components/InspectionHeader';
import { FileListPanel } from './components/FileListPanel';

const EMPTY_BRANCHES: string[] = [];

interface InspectionViewProps {
  worktreeId: string;
  panZoomConfig?: PanZoomConfig;
}

export const InspectionView = React.memo(({ worktreeId, panZoomConfig }: InspectionViewProps) => {
  const actions = useActions();
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

  const handleFileRowClick = (wtId: string, filePath: string) => {
    actions.fileClick(wtId, filePath);
    setFocusNodeId(`file-${wtId}-${filePath}`);
  };

  const handleFocusComplete = () => {
    setFocusNodeId(null);
  };

  // Clear filter, hover, and focus when switching worktrees
  useEffect(() => {
    setSearchQuery('');
    setFocusNodeId(null);
    setHoveredFilePath(null);
  }, [worktreeId]);

  const hierarchyFiles = wt ? getAllFilteredFiles(wt, searchQuery) : [];

  const { nodes, edges } = (() => {
    if (!wt)
      return {
        nodes: [] as ReturnType<typeof computeSingleWorktreeLayout>['nodes'],
        edges: [] as ReturnType<typeof computeSingleWorktreeLayout>['edges'],
      };
    const layout = computeSingleWorktreeLayout(
      wt,
      { bare: true, filesOverride: hierarchyFiles },
      (wtId, filePath) => getFileFindings(insightDetails, wtId, filePath).length
    );
    return { nodes: layout.nodes, edges: layout.edges };
  })();

  if (!wt) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-faint text-13">
        Worktree not found
      </div>
    );
  }

  const checkoutBranches = filterCheckoutableBranches(branchList, occupiedBranches);
  const hoverContextValue = { hoveredFilePath };

  return (
    <div className="w-full h-full flex flex-col bg-canvas">
      <InspectionHeader
        wt={wt}
        branchList={branchList}
        checkoutBranches={checkoutBranches}
        isLoading={isLoading}
        isFetchingBranches={isFetchingBranches}
        lastFetchAt={lastFetchAt}
      />

      {actionConfigs.length > 0 && <CheckBar worktreeId={worktreeId} />}

      <div className="flex-1 min-h-0 flex flex-col min-[600px]:flex-row">
        <FileListPanel
          wt={wt}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onFileClick={handleFileRowClick}
          onHoverFile={setHoveredFilePath}
        />

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
