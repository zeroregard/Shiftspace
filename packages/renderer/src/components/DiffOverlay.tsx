import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { create } from 'zustand';
import type { FileChange } from '../types';
import { hunksToUnified } from '../utils/hunksToUnified';

const LazyPatchDiff = React.lazy(() =>
  import('@pierre/diffs/react').then((m) => ({ default: m.PatchDiff }))
);

export const usePopoverStore = create<{
  openId: string | null;
  setOpen: (id: string | null) => void;
}>((set) => ({
  openId: null,
  setOpen: (id) => set({ openId: id }),
}));

/** @deprecated Use usePopoverStore instead */
export const useHoverCardStore = usePopoverStore;

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
    <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
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
    <>
      <DiffHeader file={file} />
      {patch ? (
        <React.Suspense fallback={<DiffLoading />}>
          <LazyPatchDiff patch={patch} options={options} />
        </React.Suspense>
      ) : (
        <EmptyDiff />
      )}
    </>
  );
});
DiffOverlayContent.displayName = 'DiffOverlayContent';

export const DiffPopover = React.memo(
  ({ file, children }: { file: FileChange; children: React.ReactNode }) => {
    const id = React.useId();
    const { openId, setOpen } = usePopoverStore();
    const openIdRef = React.useRef(openId);
    openIdRef.current = openId;
    const handleClick = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        setOpen(openIdRef.current === id ? null : id);
      },
      [id, setOpen]
    );
    return (
      <Popover.Root
        open={openId === id}
        onOpenChange={(open) => {
          if (open) setOpen(id);
          else if (openId === id) setOpen(null);
        }}
      >
        <Popover.Trigger asChild onClick={handleClick}>
          {children}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="right"
            sideOffset={8}
            align="start"
            className="z-50 overflow-y-auto bg-canvas border border-border-default rounded-md animate-popover-open"
            style={{ width: 520, maxHeight: 420 }}
          >
            <DiffOverlayContent file={file} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
);
DiffPopover.displayName = 'DiffPopover';

/** @deprecated Use DiffPopover instead */
export const DiffHoverCard = DiffPopover;
