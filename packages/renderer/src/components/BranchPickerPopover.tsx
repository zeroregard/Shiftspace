import React, { useState, useRef, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Tooltip } from './Tooltip';
import { RefreshIcon } from '../icons';

export interface StaticOption {
  key: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  trigger: React.ReactNode;
  branches: string[];
  selectedBranch?: string | null;
  staticOptions?: StaticOption[];
  branchLabel?: (branch: string) => string;
  onSelectBranch: (branch: string) => void;
  onOpen?: () => void;
  /** Called when the fetch button is clicked. */
  onFetch?: () => void;
  /** Whether a fetch is in progress (drives the spinner). */
  isFetching?: boolean;
  /** Timestamp of the last successful fetch — shown in the tooltip. */
  lastFetchAt?: number;
}

export const BranchPickerPopover = React.memo(
  ({
    trigger,
    branches,
    selectedBranch,
    staticOptions,
    branchLabel,
    onSelectBranch,
    onOpen,
    onFetch,
    isFetching,
    lastFetchAt,
  }: Props) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [fetchDone, setFetchDone] = useState(false);
    const fetchDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // When isFetching transitions false→true→false, briefly show checkmark
    const prevFetchingRef = useRef(isFetching);
    useEffect(() => {
      if (prevFetchingRef.current && !isFetching) {
        setFetchDone(true);
        fetchDoneTimerRef.current = setTimeout(() => setFetchDone(false), 3000);
      }
      prevFetchingRef.current = isFetching;
      return () => {
        if (fetchDoneTimerRef.current) clearTimeout(fetchDoneTimerRef.current);
      };
    }, [isFetching]);

    const handleOpenChange = (next: boolean) => {
      setOpen(next);
      if (next) {
        onOpen?.();
      } else {
        setQuery('');
      }
    };

    const close = () => {
      setOpen(false);
      setQuery('');
    };

    const q = query.toLowerCase();
    const filteredStatic = staticOptions?.filter((o) => !q || o.label.toLowerCase().includes(q));
    const filteredBranches = branches.filter((b) => !q || b.toLowerCase().includes(q)).slice(0, 10);

    const hasItems = (filteredStatic?.length ?? 0) > 0 || filteredBranches.length > 0;

    const fetchTooltip = isFetching
      ? 'Fetching…'
      : lastFetchAt
        ? `Last fetch: ${timeAgo(lastFetchAt)}`
        : 'Fetch remote branches';

    return (
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 w-72 rounded-lg border border-border-default bg-node-file p-1 shadow-lg animate-popover-open"
            align="end"
            sideOffset={4}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-1.5 py-1 mb-1 flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search branches…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent border border-border-dashed rounded px-2 py-1 text-11 text-text-primary outline-none placeholder:text-text-muted"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                  e.stopPropagation();
                }}
              />
              {onFetch && (
                <Tooltip content={fetchTooltip} delayDuration={200}>
                  <button
                    disabled={isFetching}
                    className="shrink-0 flex items-center justify-center w-6 h-6 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default bg-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFetch();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {fetchDone ? (
                      <span className="text-status-added text-11 leading-none">✓</span>
                    ) : (
                      <span
                        style={{
                          display: 'flex',
                          animation: isFetching ? 'spin 1s linear infinite' : undefined,
                        }}
                      >
                        <RefreshIcon />
                      </span>
                    )}
                  </button>
                </Tooltip>
              )}
            </div>

            {filteredStatic?.map((opt) => (
              <button
                key={opt.key}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-13 text-left cursor-pointer border-none bg-transparent hover:bg-item-hover ${opt.selected ? 'text-text-primary' : 'text-text-secondary'}`}
                onClick={() => {
                  opt.onSelect();
                  close();
                }}
              >
                <span className="w-3 text-center text-11 shrink-0">{opt.selected ? '✓' : ''}</span>
                {opt.label}
              </button>
            ))}

            {(filteredStatic?.length ?? 0) > 0 && filteredBranches.length > 0 && (
              <div className="my-1 border-t border-border-default" />
            )}

            {filteredBranches.map((b) => {
              const label = branchLabel ? branchLabel(b) : b;
              const selected = b === selectedBranch;
              return (
                <button
                  key={b}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-13 text-left cursor-pointer border-none bg-transparent hover:bg-item-hover ${selected ? 'text-text-primary' : 'text-text-secondary'}`}
                  onClick={() => {
                    onSelectBranch(b);
                    close();
                  }}
                >
                  <span className="w-3 text-center text-11 shrink-0">{selected ? '✓' : ''}</span>
                  {label}
                </button>
              );
            })}

            {!hasItems && (
              <div className="px-2 py-1.5 text-11 text-text-faint italic">No branches found</div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
);
BranchPickerPopover.displayName = 'BranchPickerPopover';
