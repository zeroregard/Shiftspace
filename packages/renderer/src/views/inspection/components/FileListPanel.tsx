import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import type {
  FileChange,
  InsightFinding,
  FileDiagnosticSummary,
  WorktreeState,
} from '../../../types';
import { useFileAnnotations } from '../../../hooks/useFileAnnotations';
import { ThemedFileIcon } from '../../../shared/ThemedFileIcon';
import { AnnotationBadges } from '../../../ui/AnnotationBadges';
import { DiffPopover } from '../../../overlays/DiffPopover';
import { Codicon } from '@shiftspace/ui/codicon';
import { Tooltip } from '@shiftspace/ui/tooltip';
import { SectionLabel as SectionLabelPrimitive } from '@shiftspace/ui/section-label';
import {
  partitionFiles,
  filterFilesByQuery,
  filterFilesByProblems,
  isValidRegex,
} from '../../../utils/listSections';

// ---------------------------------------------------------------------------
// File row
// ---------------------------------------------------------------------------

interface InspectionFileRowProps {
  file: FileChange;
  worktreeId: string;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onHoverFile?: (filePath: string | null) => void;
}

function InspectionFileRow({ file, worktreeId, onFileClick, onHoverFile }: InspectionFileRowProps) {
  const parts = file.path.split('/');
  const fileName = parts.pop() ?? file.path;
  const dirPath = parts.join('/');
  const isDeleted = file.status === 'deleted';

  const annotations = useFileAnnotations(worktreeId, file.path);

  return (
    <DiffPopover file={file} worktreeId={worktreeId}>
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
        <span className="shrink-0 flex items-center">
          <ThemedFileIcon filePath={file.path} size={16} />
        </span>

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

        <AnnotationBadges annotations={annotations} diffHunks={file.diff} />
      </button>
    </DiffPopover>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function FileSectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
      <SectionLabelPrimitive>{label}</SectionLabelPrimitive>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Virtual list item types
// ---------------------------------------------------------------------------

const SECTION_LABEL_HEIGHT = 28;
const FILE_ROW_HEIGHT = 32;

type VirtualItem =
  | { type: 'label'; label: string }
  | { type: 'file'; file: FileChange; sectionKey: string };

// ---------------------------------------------------------------------------
// Debounced search input
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 150;

interface SearchInputProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  problemsOnly: boolean;
  onProblemsOnlyChange: (value: boolean) => void;
  filteredFileCount: number;
  totalFileCount: number;
}

function SearchInput({
  searchQuery,
  onSearchChange,
  problemsOnly,
  onProblemsOnlyChange,
  filteredFileCount,
  totalFileCount,
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
    <div className="px-2 pt-2 pb-1 shrink-0">
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
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-primary cursor-pointer bg-transparent border-none p-0"
              onClick={handleClear}
            >
              <Codicon name="close" size={12} />
            </button>
          )}
        </div>
        <Tooltip content={problemsOnly ? 'Show all files' : 'Show only files with problems'}>
          <button
            data-testid="problems-filter-toggle"
            className={clsx(
              'shrink-0 flex items-center justify-center w-7 h-7 rounded-md border transition-colors cursor-pointer',
              problemsOnly
                ? 'bg-status-deleted/15 border-status-deleted text-status-deleted'
                : 'bg-node-file border-border-dashed text-text-faint hover:text-text-primary hover:border-text-muted'
            )}
            onClick={() => onProblemsOnlyChange(!problemsOnly)}
          >
            <Codicon name="warning" size={14} />
          </button>
        </Tooltip>
      </div>
      {isFiltering && (
        <div className="text-10 text-text-faint px-1 pt-1">
          {filteredFileCount} / {totalFileCount} files
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File list panel
// ---------------------------------------------------------------------------

interface FileListPanelProps {
  wt: WorktreeState;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  problemsOnly: boolean;
  onProblemsOnlyChange: (value: boolean) => void;
  findingsIndex: Map<string, InsightFinding[]>;
  fileDiagnostics: Map<string, FileDiagnosticSummary>;
  onFileClick: (worktreeId: string, filePath: string) => void;
  onHoverFile: (filePath: string | null) => void;
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
      result.push({ type: 'label', label: 'Committed' });
      for (const file of filteredCommitted) {
        result.push({ type: 'file', file, sectionKey: 'committed' });
      }
    }
    if (filteredStaged.length > 0) {
      result.push({ type: 'label', label: 'Staged' });
      for (const file of filteredStaged) {
        result.push({ type: 'file', file, sectionKey: 'staged' });
      }
    }
    if (filteredUnstaged.length > 0) {
      result.push({ type: 'label', label: 'Unstaged' });
      for (const file of filteredUnstaged) {
        result.push({ type: 'file', file, sectionKey: 'unstaged' });
      }
    }
    return result;
  }, [filteredCommitted, filteredStaged, filteredUnstaged]);

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
      className="min-[600px]:w-[35%] min-[600px]:max-w-sm border-b min-[600px]:border-b-0 min-[600px]:border-r border-border-dashed flex flex-col shrink-0"
    >
      <SearchInput
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        problemsOnly={problemsOnly}
        onProblemsOnlyChange={onProblemsOnlyChange}
        filteredFileCount={filteredFileCount}
        totalFileCount={totalFileCount}
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 pt-0">
        {isEmpty ? (
          <div className="text-text-faint text-11 px-3 py-2">
            {searchQuery || problemsOnly ? 'No matching files' : 'No changes'}
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
                    <FileSectionLabel label={item.label} />
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
