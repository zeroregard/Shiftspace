import { minimatch } from 'minimatch';
import type { FileChange } from '@shiftspace/renderer';

/**
 * True when a path matches any of the given glob patterns.
 * Uses minimatch with `dot: true` so patterns like `*.env` match `.env`.
 */
export function isIgnoredByPatterns(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}

/**
 * Filters out files whose paths match any of the given glob patterns.
 */
export function filterIgnoredFiles(files: FileChange[], patterns: string[]): FileChange[] {
  if (patterns.length === 0) return files;
  return files.filter((file) => !isIgnoredByPatterns(file.path, patterns));
}
