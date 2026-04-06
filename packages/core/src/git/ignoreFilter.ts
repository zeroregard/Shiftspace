import { minimatch } from 'minimatch';
import type { FileChange } from '@shiftspace/renderer';

/**
 * Filters out files whose paths match any of the given glob patterns.
 * Uses minimatch with `dot: true` so patterns like `*.env` match `.env`.
 */
export function filterIgnoredFiles(files: FileChange[], patterns: string[]): FileChange[] {
  if (patterns.length === 0) return files;
  return files.filter(
    (file) => !patterns.some((pattern) => minimatch(file.path, pattern, { dot: true }))
  );
}
