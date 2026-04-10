import { useState, useEffect } from 'react';
import { formatRelativeTime, TICK_INTERVAL } from '../utils/relative-time';

/**
 * Returns a compact relative-time string (e.g. "3s", "2m", "1h") that
 * auto-updates every 10 seconds. Returns `null` when timestamp is 0.
 */
export function useRelativeTime(timestamp: number): string | null {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const id = setInterval(() => tick((n) => n + 1), TICK_INTERVAL);
    return () => clearInterval(id);
  }, [timestamp]);

  return formatRelativeTime(timestamp);
}
