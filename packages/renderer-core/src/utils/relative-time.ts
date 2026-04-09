const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Format a timestamp as a compact relative-time string.
 * Returns `null` when the timestamp is 0 / falsy (no data).
 *
 * Examples: "3s", "2m", "1h", "3d", "2w"
 */
export function formatRelativeTime(timestamp: number): string | null {
  if (!timestamp) return null;
  const age = Date.now() - timestamp;
  if (age < 0) return null; // future timestamp — shouldn't happen

  if (age < MINUTE) return `${Math.max(1, Math.floor(age / SECOND))}s`;
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  if (age < 2 * WEEK) return `${Math.floor(age / DAY)}d`;
  return `${Math.floor(age / WEEK)}w`;
}

/**
 * Return the appropriate setInterval tick (ms) based on age.
 * Keeps re-renders infrequent for older timestamps.
 *
 * - age < 60 s  → tick every 10 s
 * - age < 1 h   → tick every 30 s
 * - age ≥ 1 h   → tick every 60 s
 */
export function getTickInterval(timestamp: number): number {
  if (!timestamp) return 60 * SECOND;
  const age = Date.now() - timestamp;
  if (age < MINUTE) return 10 * SECOND;
  if (age < HOUR) return 30 * SECOND;
  return 60 * SECOND;
}
