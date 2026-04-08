import type { DiffHunk } from '../types';

/**
 * Parse the "new-file start line" from a unified diff hunk header.
 * Handles both `+N,M` and `+N` (count omitted when 1).
 */
function parseNewStart(header: string): number | undefined {
  const m = header.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Look up a source-code line from structured diff hunks.
 *
 * Walks the hunks tracking "new-file" line numbers (context + added lines
 * increment the counter; removed lines do not exist in the new file).
 * Returns the line content if the target falls within a hunk, or `undefined`.
 */
export function getSourceLineFromHunks(
  hunks: DiffHunk[] | undefined,
  targetLine: number
): string | undefined {
  if (!hunks?.length || targetLine < 1) return undefined;

  for (const hunk of hunks) {
    const newStart = parseNewStart(hunk.header);
    if (newStart === undefined) continue;

    let lineNum = newStart;
    for (const dl of hunk.lines) {
      if (dl.type === 'removed') continue; // removed lines aren't in the new file
      if (lineNum === targetLine) return dl.content;
      lineNum++;
    }
  }

  return undefined;
}
