import { useState, useEffect } from 'react';
import { formatRelativeTime, getTickInterval } from '../utils/relative-time';

/**
 * Returns a compact relative-time string (e.g. "3s", "2m", "1h") that
 * auto-updates at a smart interval. Returns `null` when timestamp is 0.
 */
export function useRelativeTime(timestamp: number): string | null {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const interval = getTickInterval(timestamp);
    const id = setInterval(() => tick((n) => n + 1), interval);
    return () => clearInterval(id);
  }, [timestamp]);

  return formatRelativeTime(timestamp);
}
