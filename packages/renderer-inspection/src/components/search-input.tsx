import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { isValidRegex } from '@shiftspace/renderer-core';
import { Codicon } from '@shiftspace/ui/codicon';
import { IconButton } from '@shiftspace/ui/icon-button';

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

export function SearchInput({
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
