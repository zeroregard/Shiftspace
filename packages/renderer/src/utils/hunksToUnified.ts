import type { DiffHunk } from '../types';

/**
 * Convert parsed DiffHunk[] back into a unified diff string
 * suitable for @pierre/diffs PatchDiff component.
 */
export function hunksToUnified(
  filePath: string,
  hunks: DiffHunk[],
  status?: 'added' | 'modified' | 'deleted'
): string {
  const oldPath = status === 'added' ? '/dev/null' : `a/${filePath}`;
  const newPath = status === 'deleted' ? '/dev/null' : `b/${filePath}`;

  const lines: string[] = [
    `diff --git a/${filePath} b/${filePath}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
  ];

  for (const hunk of hunks) {
    lines.push(hunk.header);
    for (const line of hunk.lines) {
      const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
      lines.push(`${prefix}${line.content}`);
    }
  }

  return lines.join('\n');
}
