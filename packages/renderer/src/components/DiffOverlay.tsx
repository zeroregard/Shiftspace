import React from 'react';
import clsx from 'clsx';
import * as HoverCard from '@radix-ui/react-hover-card';
import { create } from 'zustand';
import type { FileChange, DiffHunk as DiffHunkType, DiffLine as DiffLineType } from '../types';

export const useHoverCardStore = create<{
  openId: string | null;
  setOpen: (id: string | null) => void;
}>((set) => ({
  openId: null,
  setOpen: (id) => set({ openId: id }),
}));

function DiffHunkHeader({ header }: { header: string }) {
  return (
    <div className="bg-diff-hunk-bg text-text-faint text-11 font-mono px-3 py-0.5 select-none">
      {header}
    </div>
  );
}

function DiffLineRow({ type, content }: DiffLineType) {
  return (
    <div
      className={clsx(
        'font-mono text-11 px-3 py-px whitespace-pre overflow-hidden',
        type === 'added' && 'text-status-added bg-diff-added-bg',
        type === 'removed' && 'text-status-deleted bg-diff-removed-bg',
        type === 'context' && 'text-text-dim'
      )}
    >
      {type === 'added' ? '+' : type === 'removed' ? '-' : ' '}
      {content}
    </div>
  );
}

function DiffHunkView({ hunk }: { hunk: DiffHunkType }) {
  return (
    <div>
      <DiffHunkHeader header={hunk.header} />
      {hunk.lines.map((line, i) => (
        <DiffLineRow key={i} {...line} />
      ))}
    </div>
  );
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

const DiffOverlayContent = React.memo(({ file }: { file: FileChange }) => (
  <>
    <DiffHeader file={file} />
    {file.diff?.length ? file.diff.map((hunk, i) => <DiffHunkView key={i} hunk={hunk} />) : null}
  </>
));
DiffOverlayContent.displayName = 'DiffOverlayContent';

export const DiffHoverCard = React.memo(
  ({ file, children }: { file: FileChange; children: React.ReactNode }) => {
    const id = React.useId();
    const { openId, setOpen } = useHoverCardStore();
    // Use a ref so the click handler stays stable (doesn't re-create on openId changes)
    const openIdRef = React.useRef(openId);
    openIdRef.current = openId;
    const handleClick = React.useCallback(
      (e: React.MouseEvent) => {
        // Stop propagation so the canvas click-to-close handler doesn't fire
        e.stopPropagation();
        setOpen(openIdRef.current === id ? null : id);
      },
      [id, setOpen]
    );
    return (
      <HoverCard.Root
        openDelay={300}
        closeDelay={150}
        open={openId === id}
        onOpenChange={(open) => {
          if (open) setOpen(id);
          else if (openId === id) setOpen(null);
        }}
      >
        <HoverCard.Trigger asChild onClick={handleClick}>
          {children}
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content
            side="right"
            sideOffset={8}
            align="start"
            className="z-50 overflow-y-auto bg-canvas border border-border-default rounded-md animate-hover-card-open"
            style={{ width: 360, maxHeight: 300 }}
          >
            <DiffOverlayContent file={file} />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    );
  }
);
DiffHoverCard.displayName = 'DiffHoverCard';
