import { useState, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorktreeStore, useActionStore, useInsightStore, getFileFindings } from '../../store';
import type { InsightFinding, FileDiagnosticSummary } from '../../types';
import { storeKey, storeKeyPrefix } from '../../utils/storeKeys';
import { TreeCanvas, type PanZoomConfig } from '../../TreeCanvas';
import { NODE_TYPES } from '../../nodes';
import { InspectionHoverContext } from '../../shared/InspectionHoverContext';
import { getAllFilteredFiles } from '../../utils/listSections';
import { computeSingleWorktreeLayout } from '../../layout';
import { CheckBar } from './components/CheckBar';
import { useActions } from '../../ui/ActionsContext';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';
import { FileListPanel } from './components/FileListPanel';

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
  const actions = useActions();
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
  const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // Defer the search query so that typing is instant but the expensive
  // layout recomputation (tree build + flatten) is batched by React.
  const deferredSearchQuery = useDeferredValue(searchQuery);

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

  const hierarchyFiles = wt ? getAllFilteredFiles(wt, deferredSearchQuery) : [];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hierarchyFiles is derived from wt + deferredSearchQuery
  }, [wt, deferredSearchQuery, stableFindingsIndex, stableFileDiagnostics]);

  if (!wt) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-faint text-13">
        Worktree not found
      </div>
    );
  }

  const hoverContextValue = { hoveredFilePath };

  return (
    <div className="w-full h-full flex flex-col bg-canvas">
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
          <ErrorBoundary
            resetKey={wt}
            fallback={(retry) => (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-faint text-13">
                <span>Graph failed to render</span>
                <button
                  onClick={retry}
                  className="px-2 py-1 text-11 rounded border border-border-default hover:bg-node-file cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}
          >
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
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
