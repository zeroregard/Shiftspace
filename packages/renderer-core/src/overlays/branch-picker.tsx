/**
 * BranchPicker — compound component for branch/option selection popovers.
 *
 * Replaces the flat 11-prop BranchPickerPopover with composable sub-components:
 *
 *   <BranchPicker onSelect={fn} onOpen={fn}>
 *     <BranchPicker.Trigger>Pick a branch</BranchPicker.Trigger>
 *     <BranchPicker.Content>
 *       <BranchPicker.Search />
 *       <BranchPicker.Options options={staticOpts} />
 *       <BranchPicker.Separator />
 *       <BranchPicker.Branches branches={list} selected="main" labelFn={fn} />
 *       <BranchPicker.Fetch onFetch={fn} isFetching={false} lastFetchAt={ts} />
 *     </BranchPicker.Content>
 *   </BranchPicker>
 */
import React, { createContext, useContext, useState, useRef } from 'react';
import clsx from 'clsx';
import * as Popover from '@radix-ui/react-popover';
import { Codicon } from '@shiftspace/ui/codicon';
import { Fetch, type FetchProps } from './branch-picker-fetch';

// Context — shared state between compound sub-components

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

// Root

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

// Trigger

interface TriggerProps {
  children: React.ReactNode;
  /** Codicon icon name (default: "git-branch") */
  icon?: string;
  /** Visual variant: "inline" (no border) or "pill" (bordered badge) */
  variant?: 'inline' | 'pill';
  /** Extra classes merged onto the button */
  className?: string;
  /** Tooltip / title text */
  title?: string;
  /** Stop pointer/click propagation (useful inside draggable containers) */
  stopPropagation?: boolean;
  /** Test hook — rendered as data-testid */
  testId?: string;
}

const TRIGGER_VARIANTS = {
  inline: 'border-none p-0',
  pill: 'px-1.5 py-1 rounded border border-border-dashed hover:border-text-muted',
};

function Trigger({
  children,
  icon = 'git-branch',
  variant = 'inline',
  className,
  title,
  stopPropagation,
  testId,
}: TriggerProps) {
  return (
    <Popover.Trigger asChild>
      <button
        className={clsx(
          'flex items-center gap-1 cursor-pointer bg-transparent transition-colors',
          TRIGGER_VARIANTS[variant],
          className
        )}
        title={title}
        data-testid={testId}
        onPointerDown={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      >
        <span className="shrink-0 translate-y-0.5">
          <Codicon name={icon} />
        </span>
        {children}
      </button>
    </Popover.Trigger>
  );
}

// Content

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

// Search

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

// Shared row — one selectable line in the popover list

function Row({
  selected,
  onClick,
  testId,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-13 text-left cursor-pointer border-none bg-transparent hover:bg-item-hover ${selected ? 'text-text-primary' : 'text-text-secondary'}`}
      data-testid={testId}
      onClick={onClick}
    >
      <span className="w-3 text-center text-11 shrink-0">{selected ? '✓' : ''}</span>
      {children}
    </button>
  );
}

// Static Options

interface StaticOption {
  key: string;
  /** Test hook — rendered as data-testid on the row */
  testId?: string;
  label: string;
  /** Optional pill rendered after the label (e.g. "default") */
  badge?: string;
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
        <Row
          key={opt.key}
          testId={opt.testId}
          selected={opt.selected}
          onClick={() => {
            opt.onSelect();
            close();
          }}
        >
          <span className="truncate">{opt.label}</span>
          {opt.badge && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full border border-border-dashed text-9 text-text-muted">
              {opt.badge}
            </span>
          )}
        </Row>
      ))}
    </>
  );
}

// Separator

function Separator() {
  return <div className="my-1 border-t border-border-default" />;
}

// Branch list

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
      {filtered.map((b) => (
        <Row
          key={b}
          selected={b === selected}
          onClick={() => {
            select(b);
            close();
          }}
        >
          {labelFn ? labelFn(b) : b}
        </Row>
      ))}
      {filtered.length === 0 && (
        <div className="px-2 py-1.5 text-11 text-text-faint italic">No branches found</div>
      )}
    </>
  );
}

// SearchRow — Search input + optional Fetch button in one row

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

// Empty state

function Empty({ children = 'No branches found' }: { children?: React.ReactNode }) {
  return <div className="px-2 py-1.5 text-11 text-text-faint italic">{children}</div>;
}

// Namespace export

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
