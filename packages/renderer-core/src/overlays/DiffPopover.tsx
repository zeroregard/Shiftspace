import React from 'react';
import ReactDOM from 'react-dom';
import { create } from 'zustand';
import { PatchDiff } from '@pierre/diffs/react';
import type { FileChange } from '../types';
import { hunksToUnified } from '../utils/hunksToUnified';
import { ErrorBoundary } from '@shiftspace/ui/error-boundary';
import { useActions } from '../ui/ActionsContext';

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

const PATCH_DIFF_OPTIONS = {
  diffStyle: 'unified' as const,
  diffIndicators: 'classic' as const,
  disableFileHeader: true,
  disableLineNumbers: false,
  overflow: 'scroll' as const,
  themeType: 'dark' as const,
  theme: 'dark-plus',
  fontSize: 11,
};

const MemoizedPatchDiff = React.memo(PatchDiff);

const DiffOverlayContent = React.memo(function DiffOverlayContent({ file }: { file: FileChange }) {
  const patch = React.useMemo(
    () =>
      file.rawDiff ??
      (file.diff?.length ? hunksToUnified(file.path, file.diff, file.status) : null),
    [file.rawDiff, file.diff, file.path, file.status]
  );

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
        {patch ? <MemoizedPatchDiff patch={patch} options={options} /> : <EmptyDiff />}
      </div>
    </div>
  );
});

const POPOVER_W = 720;
const POPOVER_H = 420;
const PADDING = 8;

/** Global popover state: Shift held, cursor position, and which file is active. */
const useDiffPopoverState = create<{
  shiftHeld: boolean;
  setShiftHeld: (v: boolean) => void;
  cursorX: number;
  cursorY: number;
  setCursor: (x: number, y: number) => void;
  activeKey: string | null;
  setActiveKey: (key: string | null) => void;
}>((set) => ({
  shiftHeld: false,
  setShiftHeld: (v) => set({ shiftHeld: v }),
  cursorX: 0,
  cursorY: 0,
  setCursor: (x, y) => set({ cursorX: x, cursorY: y }),
  activeKey: null,
  setActiveKey: (key) => set({ activeKey: key }),
}));

// One global listener set — registered lazily on first mount.
let listenersAttached = false;
function ensureGlobalListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  const { setShiftHeld, setCursor } = useDiffPopoverState.getState();
  // mousemove: tracks cursor position AND shift state (works without focus)
  window.addEventListener(
    'mousemove',
    (e) => {
      setCursor(e.clientX, e.clientY);
      setShiftHeld(e.shiftKey);
    },
    { passive: true }
  );
  // keydown/keyup: catches Shift press/release while hovering without moving the mouse
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') setShiftHeld(true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') setShiftHeld(false);
  });
}

export function DiffPopover({
  file,
  worktreeId,
  children,
}: {
  file: FileChange;
  worktreeId: string;
  children: React.ReactNode;
}) {
  const myKey = file.path;
  const { fileClick } = useActions();
  const shiftHeld = useDiffPopoverState((s) => s.shiftHeld);
  const activeKey = useDiffPopoverState((s) => s.activeKey);
  const setActiveKey = useDiffPopoverState((s) => s.setActiveKey);
  const cursorX = useDiffPopoverState((s) => s.cursorX);
  const cursorY = useDiffPopoverState((s) => s.cursorY);

  React.useEffect(ensureGlobalListeners, []);

  const isMe = activeKey === myKey;
  const open = isMe && shiftHeld;

  const handleEnter = () => setActiveKey(myKey);
  const handleLeave = () => {
    // Only clear if we're still the active one
    if (useDiffPopoverState.getState().activeKey === myKey) setActiveKey(null);
  };

  // Snapshot cursor position when the popover opens so it doesn't jump around
  const anchor = React.useRef({ x: 0, y: 0 });
  const wasOpen = React.useRef(false);
  if (open && !wasOpen.current) {
    anchor.current = { x: cursorX, y: cursorY };
  }
  wasOpen.current = open;

  // Compute position: prefer below cursor, flip above if not enough space
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const w = Math.min(POPOVER_W, vw - PADDING * 2);

  let top: number;
  const spaceBelow = vh - anchor.current.y - PADDING;
  const spaceAbove = anchor.current.y - PADDING;
  if (spaceBelow >= POPOVER_H || spaceBelow >= spaceAbove) {
    top = anchor.current.y + 12;
  } else {
    top = anchor.current.y - POPOVER_H - 12;
  }
  top = Math.max(PADDING, Math.min(top, vh - POPOVER_H - PADDING));

  let left = anchor.current.x;
  left = Math.max(PADDING, Math.min(left, vw - w - PADDING));

  // Track whether this popover has ever been opened so we can lazily mount
  // the heavy PatchDiff subtree once, then keep it alive (hidden) afterwards.
  const hasBeenOpened = React.useRef(false);
  if (open) hasBeenOpened.current = true;

  return (
    <>
      <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {children}
      </div>
      {hasBeenOpened.current &&
        ReactDOM.createPortal(
          <div
            style={{
              position: 'fixed',
              top,
              left,
              width: w,
              maxHeight: POPOVER_H,
              zIndex: 9999,
              visibility: open ? 'visible' : 'hidden',
              pointerEvents: open ? 'auto' : 'none',
            }}
            className="flex flex-col overflow-hidden bg-canvas border border-border-default rounded-md shadow-lg cursor-pointer"
            onClick={() => fileClick(worktreeId, file.path)}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            <ErrorBoundary
              resetKey={file}
              fallback={
                <div className="px-3 py-4 text-text-faint text-11 italic text-center">
                  diff failed to load
                </div>
              }
            >
              <DiffOverlayContent file={file} />
            </ErrorBoundary>
          </div>,
          document.body
        )}
    </>
  );
}
