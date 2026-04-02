import React from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';
import type { FileChange } from '../types';
import { hunksToUnified } from '../utils/hunksToUnified';

const LazyPatchDiff = React.lazy(() =>
  import('@pierre/diffs/react').then((m) => ({ default: m.PatchDiff }))
);

function langFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    css: 'css',
    json: 'json',
    md: 'markdown',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
    toml: 'toml',
    xml: 'xml',
    scss: 'scss',
    less: 'less',
  };
  return map[ext] ?? 'text';
}

function DiffHeader({ file }: { file: FileChange }) {
  const fileName = file.path.split('/').pop() ?? file.path;
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-border-default bg-canvas shrink-0">
      <span className="text-text-secondary text-11 font-medium truncate">{fileName}</span>
      <span className="text-text-faint text-10 shrink-0 ml-2">
        <span className="text-status-added">+{file.linesAdded}</span>{' '}
        <span className="text-status-deleted">-{file.linesRemoved}</span>
      </span>
    </div>
  );
}

function EmptyDiff() {
  return <div className="px-3 py-2 text-text-faint text-11 italic">no diff available</div>;
}

function DiffLoading() {
  return <div className="px-3 py-4 text-text-faint text-11 italic text-center">loading diff…</div>;
}

const PATCH_DIFF_OPTIONS = {
  diffStyle: 'unified' as const,
  diffIndicators: 'classic' as const,
  disableFileHeader: true,
  disableLineNumbers: false,
  overflow: 'scroll' as const,
  themeType: 'dark' as const,
  theme: 'dark-plus',
};

function DiffOverlayContent({ file }: { file: FileChange }) {
  const patch =
    file.rawDiff ?? (file.diff?.length ? hunksToUnified(file.path, file.diff, file.status) : null);

  const options = {
    ...PATCH_DIFF_OPTIONS,
    language: langFromPath(file.path),
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DiffHeader file={file} />
      <div className="flex-1 min-h-0 overflow-auto">
        {patch ? (
          <React.Suspense fallback={<DiffLoading />}>
            <LazyPatchDiff patch={patch} options={options} />
          </React.Suspense>
        ) : (
          <EmptyDiff />
        )}
      </div>
    </div>
  );
}

const POPOVER_W = 720;
const POPOVER_H = 420;
const OFFSET = 12;
const COLLISION_PADDING = 8;
const OPEN_DELAY = 300;

// Module-level tracker so all DiffPopover instances share the same active state.
// When any popover is open, subsequent ones open with 0 delay for instant switching.
let _activeDiffKey: string | null = null;
const _subscribers = new Set<() => void>();

function setActiveDiffKey(key: string | null) {
  if (_activeDiffKey === key) return;
  _activeDiffKey = key;
  _subscribers.forEach((fn) => fn());
}

export function DiffPopover({ file, children }: { file: FileChange; children: React.ReactNode }) {
  const myKey = file.path;
  const [open, setOpen] = React.useState(false);
  const [openDelay, setOpenDelay] = React.useState(OPEN_DELAY);
  const [side, setSide] = React.useState<'top' | 'right' | 'bottom' | 'left'>('bottom');
  const [width, setWidth] = React.useState(POPOVER_W);
  const triggerEl = React.useRef<Element | null>(null);
  const triggerRef = (node: Element | null) => {
    triggerEl.current = node;
  };

  React.useEffect(() => {
    const update = () => {
      setOpenDelay(_activeDiffKey !== null && _activeDiffKey !== myKey ? 0 : OPEN_DELAY);
    };
    _subscribers.add(update);
    return () => {
      _subscribers.delete(update);
    };
  }, [myKey]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setActiveDiffKey(myKey);
      if (triggerEl.current) {
        const rect = triggerEl.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - OFFSET;
        const spaceAbove = rect.top - OFFSET;
        setSide(spaceBelow >= spaceAbove ? 'bottom' : 'top');
        setWidth(Math.min(POPOVER_W, window.innerWidth - COLLISION_PADDING * 2));
      }
    } else {
      if (_activeDiffKey === myKey) setActiveDiffKey(null);
    }
    setOpen(nextOpen);
  };

  return (
    <HoverCard.Root
      open={open}
      onOpenChange={handleOpenChange}
      openDelay={openDelay}
      closeDelay={50}
    >
      <HoverCard.Trigger asChild ref={triggerRef as React.Ref<HTMLAnchorElement>}>
        {children}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side={side}
          sideOffset={OFFSET}
          align="start"
          avoidCollisions={false}
          className="z-50 flex flex-col overflow-hidden bg-canvas border border-border-default rounded-md animate-popover-open"
          style={{ width, maxHeight: POPOVER_H }}
        >
          <DiffOverlayContent file={file} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
