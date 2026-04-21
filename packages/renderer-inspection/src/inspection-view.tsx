import { useState, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useWorktreeStore,
  useActionStore,
  useInsightStore,
  getFileFindings,
  type InsightFinding,
  type FileDiagnosticSummary,
  storeKey,
  storeKeyPrefix,
  TreeCanvas,
  type PanZoomConfig,
  NODE_TYPES,
  InspectionHoverContext,
  InspectionFiltersContext,
  getAllFilteredFiles,
  filterFilesByProblems,
  computeSingleWorktreeLayout,
  ActionBar,
  useActions,
} from '@shiftspace/renderer-core';
import { Button } from '@shiftspace/ui/button';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';
import { FileListPanel } from './components/file-list-panel';

/**
 * Returns a stable Map reference that only changes when the entries
 * actually differ (by size + value identity).  Prevents downstream
 * useMemo from recomputing when useShallow returns a structurally
 * identical but referentially new Map.
 */
function useStableMapRef<K, V>(next: Map<K, V>): Map<K, V> {
  const ref = useRef(next);
  const prev = ref.current;
  if (prev === next) return prev;
  if (prev.size !== next.size) {
    ref.current = next;
    return next;
  }
  for (const [key, val] of next) {
    if (prev.get(key) !== val) {
      ref.current = next;
      return next;
    }
  }
  return prev;
}

interface InspectionViewProps {
  worktreeId: string;
  panZoomConfig?: PanZoomConfig;
}

export function InspectionView({ worktreeId, panZoomConfig }: InspectionViewProps) {
  const { fileClick } = useActions();
  const wt = useWorktreeStore((s) => s.worktrees.get(worktreeId));
  // Select only entries for this worktree so insight updates for *other*
  // worktrees don't trigger layout recomputation.  useShallow compares Map
  // entries by reference — if the values haven't changed, no re-render.
  const findingsIndex = useInsightStore(
    useShallow((s) => {
      const filtered = new Map<string, InsightFinding[]>();
      const pfx = storeKeyPrefix(worktreeId);
      for (const [key, val] of s.findingsIndex) {
        if (key.startsWith(pfx)) filtered.set(key, val);
      }
      return filtered;
    })
  );
  const fileDiagnostics = useInsightStore(
    useShallow((s) => {
      const filtered = new Map<string, FileDiagnosticSummary>();
      const pfx = storeKeyPrefix(worktreeId);
      for (const [key, val] of s.fileDiagnostics) {
        if (key.startsWith(pfx)) filtered.set(key, val);
      }
      return filtered;
    })
  );

  // Stabilize references: only update the layout-facing values when the
  // filtered Maps actually differ (by entry count + value identity).
  // This prevents layout recomputation when unrelated worktrees change.
  const stableFindingsIndex = useStableMapRef(findingsIndex);
  const stableFileDiagnostics = useStableMapRef(fileDiagnostics);
  const actionConfigs = useActionStore((s) => s.actionConfigs);

  const [searchQuery, setSearchQuery] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // Defer the search query so that typing is instant but the expensive
  // layout recomputation (tree build + flatten) is batched by React.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const handleFileRowClick = (wtId: string, filePath: string, line?: number) => {
    fileClick(wtId, filePath, line);
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

  const hierarchyFiles = useMemo(() => {
    if (!wt) return [];
    const filtered = getAllFilteredFiles(wt, deferredSearchQuery);
    if (!problemsOnly) return filtered;
    return filterFilesByProblems(filtered, wt.id, stableFindingsIndex, stableFileDiagnostics);
  }, [wt, deferredSearchQuery, problemsOnly, stableFindingsIndex, stableFileDiagnostics]);

  const { nodes, edges } = useMemo(() => {
    if (!wt)
      return {
        nodes: [] as ReturnType<typeof computeSingleWorktreeLayout>['nodes'],
        edges: [] as ReturnType<typeof computeSingleWorktreeLayout>['edges'],
      };
    const layout = computeSingleWorktreeLayout(
      wt,
      { bare: true, filesOverride: hierarchyFiles },
      (wtId, filePath) => {
        const findings = getFileFindings(stableFindingsIndex, wtId, filePath);
        const diag = stableFileDiagnostics.get(storeKey(wtId, filePath));
        return findings.length + (diag?.errors ? 1 : 0) + (diag?.warnings ? 1 : 0);
      }
    );
    return { nodes: layout.nodes, edges: layout.edges };
  }, [wt, hierarchyFiles, stableFindingsIndex, stableFileDiagnostics]);

  if (!wt) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-faint text-13">
        Worktree not found
      </div>
    );
  }

  const inspectionContextValue = {
    hoveredFilePath,
    setHoveredFilePath,
    onFileClick: handleFileRowClick,
  };

  const filtersContextValue = {
    searchQuery,
    setSearchQuery,
    problemsOnly,
    setProblemsOnly,
  };

  return (
    <InspectionFiltersContext.Provider value={filtersContextValue}>
      <InspectionHoverContext.Provider value={inspectionContextValue}>
        <div className="w-full h-full flex flex-col bg-canvas">
          {actionConfigs.length > 0 && (
            <ActionBar
              worktreeId={worktreeId}
              className="px-3 py-1.5 border-b border-border-dashed shrink-0"
            />
          )}

          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto min-[600px]:overflow-hidden min-[600px]:flex-row">
            <FileListPanel
              wt={wt}
              findingsIndex={stableFindingsIndex}
              fileDiagnostics={stableFileDiagnostics}
            />

            <div className="hidden min-[600px]:block flex-1 min-h-0 min-w-0 relative">
              <ErrorBoundary
                resetKey={wt}
                fallback={(retry) => (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-faint text-13">
                    <span>Graph failed to render</span>
                    <Button variant="ghost" size="sm" onClick={retry}>
                      Retry
                    </Button>
                  </div>
                )}
              >
                <TreeCanvas
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  panZoomConfig={panZoomConfig}
                  focusNodeId={focusNodeId}
                  onFocusComplete={handleFocusComplete}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </InspectionHoverContext.Provider>
    </InspectionFiltersContext.Provider>
  );
}
