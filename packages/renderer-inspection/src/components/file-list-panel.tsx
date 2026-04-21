import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type {
  FileChange,
  FileDiagnosticSummary,
  InsightFinding,
  WorktreeState,
} from '@shiftspace/renderer-core';
import {
  useFilteredFiles,
  useResizableWidth,
  useInspectionFilters,
} from '@shiftspace/renderer-core';
import { SearchInput } from './search-input';
import { InspectionFileRow, FileSectionLabel } from './file-row';

const SECTION_LABEL_HEIGHT = 28;
const FILE_ROW_HEIGHT = 32;

type VirtualItem =
  | { type: 'label'; label: string; icon?: string }
  | { type: 'file'; file: FileChange; sectionKey: string };

interface FileListPanelProps {
  wt: WorktreeState;
  findingsIndex: Map<string, InsightFinding[]>;
  fileDiagnostics: Map<string, FileDiagnosticSummary>;
}

const WIDTH_STORAGE_KEY = 'shiftspace:file-list-width';
const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 280;

export function FileListPanel({ wt, findingsIndex, fileDiagnostics }: FileListPanelProps) {
  const { searchQuery, problemsOnly, setProblemsOnly } = useInspectionFilters();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { committed, staged, unstaged, totalFileCount, filteredFileCount, hasAnyProblems } =
    useFilteredFiles({
      wt,
      searchQuery,
      problemsOnly,
      onProblemsOnlyChange: setProblemsOnly,
      findingsIndex,
      fileDiagnostics,
    });

  // `useVirtualizer` is intentionally kept inline here rather than extracted
  // into a custom hook — wrapping it in a hook (even with the ref co-located)
  // leaves the virtualizer with a stale scroll element under React Compiler,
  // and the list renders empty.
  const items = useMemo(() => {
    const result: VirtualItem[] = [];
    if (committed.length > 0) {
      result.push({
        type: 'label',
        label: wt.diffMode.type === 'repo' ? 'Tracked' : 'Committed',
        icon: 'git-branch',
      });
      for (const file of committed) {
        result.push({ type: 'file', file, sectionKey: 'committed' });
      }
    }
    if (staged.length > 0) {
      result.push({ type: 'label', label: 'Staged', icon: 'git-branch-staged-changes' });
      for (const file of staged) {
        result.push({ type: 'file', file, sectionKey: 'staged' });
      }
    }
    if (unstaged.length > 0) {
      result.push({ type: 'label', label: 'Unstaged', icon: 'git-branch-changes' });
      for (const file of unstaged) {
        result.push({ type: 'file', file, sectionKey: 'unstaged' });
      }
    }
    return result;
  }, [committed, staged, unstaged, wt.diffMode.type]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index].type === 'label' ? SECTION_LABEL_HEIGHT : FILE_ROW_HEIGHT,
    overscan: 10,
  });

  const resize = useResizableWidth({
    storageKey: WIDTH_STORAGE_KEY,
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    defaultWidth: DEFAULT_WIDTH,
  });

  const isEmpty = filteredFileCount === 0;

  return (
    <div
      data-testid="file-list-panel"
      className="grow min-[600px]:grow-0 relative border-b min-[600px]:border-b-0 min-[600px]:border-r border-border-dashed flex flex-col w-full min-[600px]:w-(--panel-w) min-[600px]:min-w-0 shrink-0 overflow-hidden"
      style={{ '--panel-w': `${resize.width}px` } as React.CSSProperties}
    >
      <div
        className="hidden min-[600px]:block absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-teal/30 active:bg-teal/40 transition-colors"
        onPointerDown={resize.onPointerDown}
        onPointerMove={resize.onPointerMove}
        onPointerUp={resize.onPointerUp}
      />
      <SearchInput
        filteredFileCount={filteredFileCount}
        totalFileCount={totalFileCount}
        hasProblems={hasAnyProblems}
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 pt-0">
        {isEmpty ? (
          <div className="text-text-faint text-11 px-3 py-2">
            {searchQuery || problemsOnly
              ? 'No matching files'
              : wt.diffMode.type === 'repo'
                ? 'No tracked files'
                : 'No changes'}
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.type === 'label' ? (
                    <FileSectionLabel label={item.label} icon={item.icon} />
                  ) : (
                    <InspectionFileRow file={item.file} worktreeId={wt.id} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
