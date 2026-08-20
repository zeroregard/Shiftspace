/**
 * BranchPicker.Fetch — the "fetch remote branches" button rendered inside the
 * picker's search row, with its spin / done states and last-fetch tooltip.
 */
import { useState, useRef, useEffect } from 'react';
import { Tooltip } from '@shiftspace/ui/tooltip';
import { Codicon } from '@shiftspace/ui/codicon';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export interface FetchProps {
  onFetch: () => void;
  isFetching?: boolean;
  lastFetchAt?: number;
}

export function Fetch({ onFetch, isFetching, lastFetchAt }: FetchProps) {
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
