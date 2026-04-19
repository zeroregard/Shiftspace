import { useRef } from 'react';
import type {
  FileDiagnosticSummary,
  InsightFinding,
  WorktreeState,
} from '@shiftspace/renderer-core';
import { useFilteredFiles, useResizableWidth } from '@shiftspace/renderer-core';
import { useVirtualFileList } from '../hooks/use-virtual-file-list';
import { SearchInput } from './search-input';
import { InspectionFileRow, FileSectionLabel } from './file-row';

interface FileListPanelProps {
  wt: WorktreeState;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  problemsOnly: boolean;
  onProblemsOnlyChange: (value: boolean) => void;
  findingsIndex: Map<string, InsightFinding[]>;
  fileDiagnostics: Map<string, FileDiagnosticSummary>;
  onFileClick: (worktreeId: string, filePath: string, line?: number) => void;
  onHoverFile: (filePath: string | null) => void;
}

const WIDTH_STORAGE_KEY = 'shiftspace:file-list-width';
const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 280;

export function FileListPanel({
  wt,
  searchQuery,
  onSearchChange,
  problemsOnly,
  onProblemsOnlyChange,
  findingsIndex,
  fileDiagnostics,
  onFileClick,
  onHoverFile,
}: FileListPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { committed, staged, unstaged, totalFileCount, filteredFileCount, hasAnyProblems } =
    useFilteredFiles({
      wt,
      searchQuery,
      problemsOnly,
      onProblemsOnlyChange,
      findingsIndex,
      fileDiagnostics,
    });

  const { items, virtualizer } = useVirtualFileList({
    committed,
    staged,
    unstaged,
    diffModeType: wt.diffMode.type,
    scrollRef,
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
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        problemsOnly={problemsOnly}
        onProblemsOnlyChange={onProblemsOnlyChange}
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
                    <InspectionFileRow
                      file={item.file}
                      worktreeId={wt.id}
                      onFileClick={onFileClick}
                      onHoverFile={onHoverFile}
                    />
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
