/**
 * BranchPicker — compound component for branch/option selection popovers.
 *
 * Replaces the flat 11-prop BranchPickerPopover with composable sub-components:
 *
 *   <BranchPicker onSelect={fn} onOpen={fn}>
 *     <BranchPicker.Trigger>
 *       <button>Pick a branch</button>
 *     </BranchPicker.Trigger>
 *     <BranchPicker.Content>
 *       <BranchPicker.Search />
 *       <BranchPicker.Options options={staticOpts} />
 *       <BranchPicker.Separator />
 *       <BranchPicker.Branches branches={list} selected="main" labelFn={fn} />
 *       <BranchPicker.Fetch onFetch={fn} isFetching={false} lastFetchAt={ts} />
 *     </BranchPicker.Content>
 *   </BranchPicker>
 */
import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Tooltip } from '@shiftspace/ui/tooltip';
import { Codicon } from '@shiftspace/ui/codicon';

// ---------------------------------------------------------------------------
// Context — shared state between compound sub-components
// ---------------------------------------------------------------------------

interface BranchPickerCtx {
  query: string;
  setQuery: (q: string) => void;
  close: () => void;
}

const Ctx = createContext<BranchPickerCtx>({
  query: '',
  setQuery: () => {},
  close: () => {},
});

function usePicker(): BranchPickerCtx {
  return useContext(Ctx);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

interface RootProps {
  onSelect?: (value: string) => void;
  onOpen?: () => void;
  children: React.ReactNode;
}

function Root({ onSelect, onOpen, children }: RootProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) onOpen?.();
    else setQuery('');
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  // Expose onSelect to children via a ref so sub-components can call it
  // without it being part of the context value (avoids re-renders)
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const ctx: BranchPickerCtx = { query, setQuery, close };

  return (
    <BranchPickerSelectContext.Provider value={selectRef}>
      <Ctx.Provider value={ctx}>
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          {children}
        </Popover.Root>
      </Ctx.Provider>
    </BranchPickerSelectContext.Provider>
  );
}

// Separate context for the select callback (ref-based, doesn't trigger re-renders)
const BranchPickerSelectContext = createContext<React.RefObject<
  ((value: string) => void) | undefined
> | null>(null);

function useSelect(): (value: string) => void {
  const ref = useContext(BranchPickerSelectContext);
  return (value: string) => ref?.current?.(value);
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

function Trigger({ children }: { children: React.ReactNode }) {
  return <Popover.Trigger asChild>{children}</Popover.Trigger>;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface ContentProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

function Content({ children, align = 'end' }: ContentProps) {
  return (
    <Popover.Portal>
      <Popover.Content
        className="z-50 w-72 rounded-lg border border-border-default bg-node-file p-1 shadow-lg animate-popover-open"
        align={align}
        sideOffset={4}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function Search({ placeholder = 'Search branches…' }: { placeholder?: string }) {
  const { query, setQuery, close } = usePicker();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="px-1.5 py-1 mb-1">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full bg-transparent border border-border-dashed rounded px-2 py-1 text-11 text-text-primary outline-none placeholder:text-text-muted"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
            e.preventDefault();
            (e.target as HTMLInputElement).select();
          }
          e.stopPropagation();
        }}
        onPaste={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static Options
// ---------------------------------------------------------------------------

interface StaticOption {
  key: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

function Options({ options }: { options: StaticOption[] }) {
  const { query, close } = usePicker();
  const q = query.toLowerCase();
  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q));

  if (filtered.length === 0) return null;

  return (
    <>
      {filtered.map((opt) => (
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function Separator() {
  return <div className="my-1 border-t border-border-default" />;
}

// ---------------------------------------------------------------------------
// Branch list
// ---------------------------------------------------------------------------

interface BranchesProps {
  branches: string[];
  selected?: string | null;
  labelFn?: (branch: string) => string;
  maxVisible?: number;
}

function Branches({ branches, selected, labelFn, maxVisible = 10 }: BranchesProps) {
  const { query, close } = usePicker();
  const select = useSelect();
  const q = query.toLowerCase();
  const filtered = branches.filter((b) => !q || b.toLowerCase().includes(q)).slice(0, maxVisible);

  if (filtered.length === 0 && !query) return null;

  return (
    <>
      {filtered.map((b) => {
        const label = labelFn ? labelFn(b) : b;
        const isSelected = b === selected;
        return (
          <button
            key={b}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-13 text-left cursor-pointer border-none bg-transparent hover:bg-item-hover ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}
            onClick={() => {
              select(b);
              close();
            }}
          >
            <span className="w-3 text-center text-11 shrink-0">{isSelected ? '✓' : ''}</span>
            {label}
          </button>
        );
      })}
      {filtered.length === 0 && (
        <div className="px-2 py-1.5 text-11 text-text-faint italic">No branches found</div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Fetch button
// ---------------------------------------------------------------------------

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface FetchProps {
  onFetch: () => void;
  isFetching?: boolean;
  lastFetchAt?: number;
}

function Fetch({ onFetch, isFetching, lastFetchAt }: FetchProps) {
  const [fetchDone, setFetchDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRef = useRef(isFetching);

  useEffect(() => {
    if (prevRef.current && !isFetching) {
      setFetchDone(true);
      timerRef.current = setTimeout(() => setFetchDone(false), 3000);
    }
    prevRef.current = isFetching;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isFetching]);

  const tip = isFetching
    ? 'Fetching…'
    : lastFetchAt
      ? `Last fetch: ${timeAgo(lastFetchAt)}`
      : 'Fetch remote branches';

  return (
    <Tooltip content={tip} delayDuration={200}>
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
            <Codicon name="refresh" size={11} />
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// SearchRow — Search input + optional Fetch button in one row
// ---------------------------------------------------------------------------

interface SearchRowProps {
  placeholder?: string;
  fetch?: FetchProps;
}

function SearchRow({ placeholder, fetch }: SearchRowProps) {
  return (
    <div className="px-1.5 py-1 mb-1 flex items-center gap-1">
      <div className="flex-1">
        <Search placeholder={placeholder} />
      </div>
      {fetch && <Fetch {...fetch} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function Empty({ children = 'No branches found' }: { children?: React.ReactNode }) {
  return <div className="px-2 py-1.5 text-11 text-text-faint italic">{children}</div>;
}

// ---------------------------------------------------------------------------
// Namespace export
// ---------------------------------------------------------------------------

export const BranchPicker = Object.assign(Root, {
  Trigger,
  Content,
  Search,
  SearchRow,
  Options,
  Separator,
  Branches,
  Fetch,
  Empty,
});

export type { StaticOption };
