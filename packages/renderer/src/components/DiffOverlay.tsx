import React from 'react';
import clsx from 'clsx';
import * as HoverCard from '@radix-ui/react-hover-card';
import type { FileChange, DiffHunk as DiffHunkType, DiffLine as DiffLineType } from '../types';

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
        type === 'added'   && 'text-status-added bg-diff-added-bg',
        type === 'removed' && 'text-status-deleted bg-diff-removed-bg',
        type === 'context' && 'text-text-dim'
      )}
    >
      {type === 'added' ? '+' : type === 'removed' ? '-' : ' '}{content}
    </div>
  );
}

function DiffHunkView({ hunk }: { hunk: DiffHunkType }) {
  return (
    <div>
      <DiffHunkHeader header={hunk.header} />
      {hunk.lines.map((line, i) => <DiffLineRow key={i} {...line} />)}
    </div>
  );
}

function DiffHeader({ file }: { file: FileChange }) {
  const fileName = file.path.split('/').pop() ?? file.path;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
      <span className="text-text-secondary text-11 font-medium truncate">{fileName}</span>
      <span className="text-text-faint text-10 shrink-0 ml-2">
        <span className="text-status-added">+{file.linesAdded}</span>
        {' '}
        <span className="text-status-deleted">-{file.linesRemoved}</span>
      </span>
    </div>
  );
}

function EmptyDiff() {
  return (
    <div className="px-3 py-2 text-text-faint text-11 italic">no diff available</div>
  );
}

const DiffOverlayContent = React.memo(({ file }: { file: FileChange }) => (
  <>
    <DiffHeader file={file} />
    {file.diff?.length
      ? file.diff.map((hunk, i) => <DiffHunkView key={i} hunk={hunk} />)
      : <EmptyDiff />}
  </>
));
DiffOverlayContent.displayName = 'DiffOverlayContent';

export const DiffHoverCard = React.memo(({ file, children }: { file: FileChange; children: React.ReactNode }) => (
  <HoverCard.Root openDelay={300} closeDelay={150}>
    <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
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
));
DiffHoverCard.displayName = 'DiffHoverCard';
