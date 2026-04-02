import clsx from 'clsx';
import type { FileChange, WorktreeState } from '../../../types';
import { useFileAnnotations } from '../../../hooks/useFileAnnotations';
import { ThemedFileIcon } from '../../../shared/ThemedFileIcon';
import { AnnotationBadges } from '../../../ui/AnnotationBadges';
import { Codicon } from '../../../ui/Codicon';
import { SectionLabel as SectionLabelPrimitive } from '../../../ui/SectionLabel';
import { partitionFiles, filterFilesByQuery, isValidRegex } from '../../../utils/listSections';

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

      <AnnotationBadges annotations={annotations} />
    </button>
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
// File list panel
// ---------------------------------------------------------------------------

interface FileListPanelProps {
  wt: WorktreeState;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onFileClick: (worktreeId: string, filePath: string) => void;
  onHoverFile: (filePath: string | null) => void;
}

export function FileListPanel({
  wt,
  searchQuery,
  onSearchChange,
  onFileClick,
  onHoverFile,
}: FileListPanelProps) {
  const searchRegexError = !isValidRegex(searchQuery);

  const { committed, staged, unstaged } = partitionFiles(wt);

  const filteredCommitted = filterFilesByQuery(committed, searchQuery);
  const filteredStaged = filterFilesByQuery(staged, searchQuery);
  const filteredUnstaged = filterFilesByQuery(unstaged, searchQuery);
  const totalFileCount = committed.length + staged.length + unstaged.length;
  const filteredFileCount =
    filteredCommitted.length + filteredStaged.length + filteredUnstaged.length;
  const isEmpty = filteredFileCount === 0;

  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
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
              onClick={() => onSearchChange('')}
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
                    onFileClick={onFileClick}
                    onHoverFile={onHoverFile}
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
                    onFileClick={onFileClick}
                    onHoverFile={onHoverFile}
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
                    onFileClick={onFileClick}
                    onHoverFile={onHoverFile}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
