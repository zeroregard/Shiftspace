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

const DiffOverlayContent = React.memo(({ file }: { file: FileChange }) => {
  const patch = React.useMemo(() => {
    if (file.rawDiff) return file.rawDiff;
    if (file.diff?.length) return hunksToUnified(file.path, file.diff, file.status);
    return null;
  }, [file.rawDiff, file.diff, file.path, file.status]);

  const options = React.useMemo(
    () => ({
      ...PATCH_DIFF_OPTIONS,
      language: langFromPath(file.path),
    }),
    [file.path]
  );

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
});
DiffOverlayContent.displayName = 'DiffOverlayContent';

const POPOVER_W = 720;
const POPOVER_H = 420;
const OFFSET = 8;
const COLLISION_PADDING = 8;

export const DiffPopover = React.memo(
  ({ file, children }: { file: FileChange; children: React.ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    const [side, setSide] = React.useState<'top' | 'right' | 'bottom' | 'left'>('bottom');
    const [width, setWidth] = React.useState(POPOVER_W);
    const triggerEl = React.useRef<Element | null>(null);
    const triggerRef = React.useCallback((node: Element | null) => {
      triggerEl.current = node;
    }, []);

    const handleOpenChange = React.useCallback((nextOpen: boolean) => {
      if (nextOpen && triggerEl.current) {
        const rect = triggerEl.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - OFFSET;
        const spaceAbove = rect.top - OFFSET;
        setSide(spaceBelow >= spaceAbove ? 'bottom' : 'top');
        setWidth(Math.min(POPOVER_W, window.innerWidth - COLLISION_PADDING * 2));
      }
      setOpen(nextOpen);
    }, []);

    return (
      <HoverCard.Root open={open} onOpenChange={handleOpenChange} openDelay={300} closeDelay={50}>
        <HoverCard.Trigger asChild ref={triggerRef as React.Ref<HTMLAnchorElement>}>
          {children}
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content
            side={side}
            sideOffset={8}
            align="start"
            avoidCollisions={true}
            collisionPadding={COLLISION_PADDING}
            className="z-50 flex flex-col overflow-hidden bg-canvas border border-border-default rounded-md animate-popover-open"
            style={{ width, maxHeight: POPOVER_H }}
          >
            <DiffOverlayContent file={file} />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    );
  }
);
DiffPopover.displayName = 'DiffPopover';

/** @deprecated Use DiffPopover instead */
export const DiffHoverCard = DiffPopover;
