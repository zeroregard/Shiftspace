import React from 'react';
import clsx from 'clsx';
import type { FileChange, DiffHunk as DiffHunkType, DiffLine as DiffLineType } from '../types';

export const OVERLAY_W = 360;
export const OVERLAY_MAX_H = 300;

export function getOverlayPosition(
  x: number,
  y: number,
  viewportW = window.innerWidth,
  viewportH = window.innerHeight
): { left: number; top: number } {
  const left = x + 20 + OVERLAY_W > viewportW ? x - 20 - OVERLAY_W : x + 20;
  const top = Math.min(Math.max(y - 20, 8), viewportH - OVERLAY_MAX_H - 8);
  return { left, top };
}

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

interface Props {
  file: FileChange;
  x: number;
  y: number;
}

export const DiffOverlay = React.memo(({ file, x, y }: Props) => {
  const { left, top } = getOverlayPosition(x, y);
  return (
    <div
      className="fixed z-50 pointer-events-none overflow-y-auto bg-canvas border border-border-default rounded-md animate-fade-in"
      style={{ left, top, width: OVERLAY_W, maxHeight: OVERLAY_MAX_H }}
    >
      <DiffHeader file={file} />
      {file.diff?.length
        ? file.diff.map((hunk, i) => <DiffHunkView key={i} hunk={hunk} />)
        : <EmptyDiff />}
    </div>
  );
});

DiffOverlay.displayName = 'DiffOverlay';
