import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@shiftspace/ui/icon-button';
import { Tooltip } from '@shiftspace/ui/tooltip';
import { useActions } from '../ui/actions-context';
import { useShiftHeld } from '../hooks/use-shift-held';
import { planContentKey, useWorktreeStore, type PlanContentEntry } from '../store/worktree-store';

interface Props {
  worktreeId: string;
  planPath: string;
}

/**
 * Icon button that opens the worktree's plan document (via the existing
 * `file-click` flow) and, while the user holds Shift, previews the file
 * contents in a tooltip. The preview fetches lazily on first shift-hover via
 * `loadPlanContent` and is cached in the worktree store until the cache is
 * cleared (e.g. planPath changes).
 */
export function PlanButton({ worktreeId, planPath }: Props) {
  const actions = useActions();
  const shiftHeld = useShiftHeld();
  const [hovered, setHovered] = useState(false);
  const cacheKey = planContentKey(worktreeId, planPath);
  const entry = useWorktreeStore((s) => s.planContents.get(cacheKey));
  const requestedRef = useRef(false);

  const shiftActive = shiftHeld && hovered;

  useEffect(() => {
    if (!shiftActive) return;
    if (requestedRef.current) return;
    if (entry && entry.status !== 'error') return;
    requestedRef.current = true;
    useWorktreeStore.getState().setPlanContent(cacheKey, { status: 'loading' });
    actions.loadPlanContent(worktreeId);
  }, [shiftActive, entry, cacheKey, worktreeId, actions]);

  useEffect(() => {
    // A fresh planPath invalidates any in-flight request.
    requestedRef.current = false;
  }, [cacheKey]);

  return (
    <Tooltip
      content={<PlanPreview planPath={planPath} entry={entry} />}
      open={shiftActive}
      delayDuration={0}
      align="start"
      contentClassName="z-50 rounded border border-border-default bg-node-file shadow-md select-none animate-fade-in"
    >
      <span
        className="inline-flex"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <IconButton
          icon="book"
          label="Open plan (hold Shift to preview)"
          size="sm"
          ghost
          tooltip={!shiftActive}
          data-testid={`plan-button-${worktreeId}`}
          onClick={(e) => {
            e.stopPropagation();
            actions.fileClick(worktreeId, planPath);
          }}
        />
      </span>
    </Tooltip>
  );
}

function PlanPreview({
  planPath,
  entry,
}: {
  planPath: string;
  entry: PlanContentEntry | undefined;
}) {
  return (
    <div className="flex flex-col max-w-[36rem] min-w-[16rem]">
      <div className="px-3 py-1.5 border-b border-border-default text-10 text-text-muted font-mono truncate">
        {planPath}
      </div>
      <div className="px-3 py-2 text-11">
        <PlanPreviewBody entry={entry} />
      </div>
    </div>
  );
}

function PlanPreviewBody({ entry }: { entry: PlanContentEntry | undefined }) {
  if (!entry || entry.status === 'loading') {
    return <span className="text-text-muted">Loading plan…</span>;
  }
  if (entry.status === 'missing') {
    return <span className="text-text-muted">Plan file not found.</span>;
  }
  if (entry.status === 'error') {
    return <span className="text-status-deleted">{entry.message}</span>;
  }
  return (
    <>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-text-primary">
        {entry.content}
      </pre>
      {entry.truncated && (
        <div className="mt-1 text-10 text-text-muted italic">
          Preview truncated — open the file to see the rest.
        </div>
      )}
    </>
  );
}
