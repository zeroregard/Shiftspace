import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import type {
  FileChange,
  InsightFinding,
  FileDiagnosticSummary,
  WorktreeState,
} from '@shiftspace/renderer-core';
import {
  useFileAnnotations,
  FileRowButton,
  DiffPopover,
  partitionFiles,
  filterFilesByQuery,
  filterFilesByProblems,
  fileHasProblems,
  isValidRegex,
} from '@shiftspace/renderer-core';
import { Codicon } from '@shiftspace/ui/codicon';
import { IconButton } from '@shiftspace/ui/icon-button';
import { SectionLabel as SectionLabelPrimitive } from '@shiftspace/ui/section-label';
// File row

interface InspectionFileRowProps {
  file: FileChange;
  worktreeId: string;
  onFileClick?: (worktreeId: string, filePath: string, line?: number) => void;
  onHoverFile?: (filePath: string | null) => void;
}

function InspectionFileRow({ file, worktreeId, onFileClick, onHoverFile }: InspectionFileRowProps) {
  const annotations = useFileAnnotations(worktreeId, file.path);

  const handleBadgeClick = onFileClick
    ? (line: number) => onFileClick(worktreeId, file.path, line)
    : undefined;

  return (
    <DiffPopover file={file} worktreeId={worktreeId}>
      <FileRowButton
        file={file}
        annotations={annotations}
        onClick={onFileClick ? () => onFileClick(worktreeId, file.path) : undefined}
        onMouseEnter={onHoverFile ? () => onHoverFile(file.path) : undefined}
        onMouseLeave={onHoverFile ? () => onHoverFile(null) : undefined}
        onBadgeClick={handleBadgeClick}
      />
    </DiffPopover>
  );
}

// Section label

function FileSectionLabel({ label, icon }: { label: string; icon?: string }) {
  return (
    <div className="ml-2.5 flex items-center gap-2 pt-2 pb-0.5">
      {icon && <Codicon name={icon} size={16} className="text-text-faint -translate-y-px" />}
      <SectionLabelPrimitive>{label}</SectionLabelPrimitive>
    </div>
  );
}

// Virtual list item types

const SECTION_LABEL_HEIGHT = 28;
const FILE_ROW_HEIGHT = 32;

type VirtualItem =
  | { type: 'label'; label: string; icon?: string }
  | { type: 'file'; file: FileChange; sectionKey: string };

// Debounced search input

const SEARCH_DEBOUNCE_MS = 150;

interface SearchInputProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  problemsOnly: boolean;
  onProblemsOnlyChange: (value: boolean) => void;
  filteredFileCount: number;
  totalFileCount: number;
  hasProblems: boolean;
}

function SearchInput({
  searchQuery,
  onSearchChange,
  problemsOnly,
  onProblemsOnlyChange,
  filteredFileCount,
  totalFileCount,
  hasProblems,
}: SearchInputProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local state when parent resets the query (e.g. worktree switch)
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  const handleChange = (value: string) => {
    setLocalQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), SEARCH_DEBOUNCE_MS);
  };

  const handleClear = () => {
    setLocalQuery('');
    clearTimeout(debounceRef.current);
    onSearchChange('');
  };

  const searchRegexError = !isValidRegex(localQuery);
  const isFiltering = !!localQuery || problemsOnly;

  return (
    <div className="px-3 pt-2 pb-1 shrink-0">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Codicon
            name="search"
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Filter files"
            className={clsx(
              'w-full pl-7 pr-7 py-1.5 rounded-md text-11 bg-node-file border outline-none transition-colors text-text-primary placeholder:text-text-faint',
              searchRegexError
                ? 'border-status-deleted'
                : 'border-border-dashed focus:border-text-muted'
            )}
          />
          {localQuery && (
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <IconButton
                icon="close"
                label="Clear filter"
                size="sm"
                ghost
                tooltip={false}
                onClick={handleClear}
              />
            </span>
          )}
        </div>
        <IconButton
          icon={hasProblems ? 'warning' : 'check'}
          label={
            !hasProblems
              ? 'No files with problems'
              : problemsOnly
                ? 'Show all files'
                : 'Show only files with problems'
          }
          iconSize={14}
          disabled={!hasProblems}
          data-testid="problems-filter-toggle"
          className={clsx(
            'w-7 h-7 rounded-md border',
            !hasProblems
              ? 'bg-node-file border-border-dashed text-green-500 opacity-60'
              : problemsOnly
                ? 'bg-status-deleted/15 border-status-deleted text-status-deleted'
                : 'bg-node-file border-border-dashed text-text-faint hover:text-text-primary hover:border-text-muted'
          )}
          onClick={() => hasProblems && onProblemsOnlyChange(!problemsOnly)}
        />
      </div>
      {isFiltering && (
        <div className="text-10 text-text-faint px-1 pt-1">
          {filteredFileCount} / {totalFileCount} files
        </div>
      )}
    </div>
  );
}

// File list panel

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

// Resizable panel width (persisted to localStorage)

const STORAGE_KEY = 'shiftspace:file-list-width';
const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 280;

function loadPersistedWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = Number(stored);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {
    // localStorage unavailable — use default
  }
  return DEFAULT_WIDTH;
}

function persistWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {
    // ignore
  }
}

function useResizableWidth() {
  const [width, setWidth] = useState(loadPersistedWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [width]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
    setWidth(next);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const delta = e.clientX - startX.current;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
    persistWidth(next);
  }, []);

  return { width, onPointerDown, onPointerMove, onPointerUp };
}

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

  const sections = useMemo(() => partitionFiles(wt), [wt]);
  const { committed, staged, unstaged } = sections;

  const hasAnyProblems = useMemo(() => {
    const allFiles = [...committed, ...staged, ...unstaged];
    return allFiles.some((f) => fileHasProblems(wt.id, f.path, findingsIndex, fileDiagnostics));
  }, [committed, staged, unstaged, wt.id, findingsIndex, fileDiagnostics]);

  // Auto-toggle off when no files have problems
  useEffect(() => {
    if (!hasAnyProblems && problemsOnly) onProblemsOnlyChange(false);
  }, [hasAnyProblems, problemsOnly, onProblemsOnlyChange]);

  const filteredCommitted = useMemo(() => {
    let files = filterFilesByQuery(committed, searchQuery);
    if (problemsOnly) files = filterFilesByProblems(files, wt.id, findingsIndex, fileDiagnostics);
    return files;
  }, [committed, searchQuery, problemsOnly, wt.id, findingsIndex, fileDiagnostics]);
  const filteredStaged = useMemo(() => {
    let files = filterFilesByQuery(staged, searchQuery);
    if (problemsOnly) files = filterFilesByProblems(files, wt.id, findingsIndex, fileDiagnostics);
    return files;
  }, [staged, searchQuery, problemsOnly, wt.id, findingsIndex, fileDiagnostics]);
  const filteredUnstaged = useMemo(() => {
    let files = filterFilesByQuery(unstaged, searchQuery);
    if (problemsOnly) files = filterFilesByProblems(files, wt.id, findingsIndex, fileDiagnostics);
    return files;
  }, [unstaged, searchQuery, problemsOnly, wt.id, findingsIndex, fileDiagnostics]);
  const totalFileCount = committed.length + staged.length + unstaged.length;
  const filteredFileCount =
    filteredCommitted.length + filteredStaged.length + filteredUnstaged.length;
  const isEmpty = filteredFileCount === 0;

  // Build a flat list of items for the virtualizer
  const items = useMemo(() => {
    const result: VirtualItem[] = [];
    if (filteredCommitted.length > 0) {
      result.push({
        type: 'label',
        label: wt.diffMode.type === 'repo' ? 'Tracked' : 'Committed',
        icon: 'git-branch',
      });
      for (const file of filteredCommitted) {
        result.push({ type: 'file', file, sectionKey: 'committed' });
      }
    }
    if (filteredStaged.length > 0) {
      result.push({ type: 'label', label: 'Staged', icon: 'git-branch-staged-changes' });
      for (const file of filteredStaged) {
        result.push({ type: 'file', file, sectionKey: 'staged' });
      }
    }
    if (filteredUnstaged.length > 0) {
      result.push({ type: 'label', label: 'Unstaged', icon: 'git-branch-changes' });
      for (const file of filteredUnstaged) {
        result.push({ type: 'file', file, sectionKey: 'unstaged' });
      }
    }
    return result;
  }, [filteredCommitted, filteredStaged, filteredUnstaged, wt.diffMode.type]);

  const resize = useResizableWidth();

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index].type === 'label' ? SECTION_LABEL_HEIGHT : FILE_ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div
      data-testid="file-list-panel"
      className="grow min-[600px]:grow-0 relative border-b min-[600px]:border-b-0 min-[600px]:border-r border-border-dashed flex flex-col w-full min-[600px]:w-(--panel-w) min-[600px]:min-w-0 shrink-0 overflow-hidden"
      style={{ '--panel-w': `${resize.width}px` } as React.CSSProperties}
    >
      {/* Drag handle */}
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
