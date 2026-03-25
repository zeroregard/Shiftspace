import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { FileChange, DiffHunk, DiffLine } from '@shiftspace/renderer';

const execFileAsync = promisify(execFile);

interface ParsedStatus {
  status: FileChange['status'];
  staged: boolean;
}

/**
 * Parse the output of `git status --porcelain -uall`.
 *
 * Each line is: XY <path>
 *   X = index/staged status, Y = working-tree/unstaged status
 *   '?' = untracked, '!' = ignored, ' ' = unmodified
 */
export function parseStatusOutput(output: string): Map<string, ParsedStatus> {
  const result = new Map<string, ParsedStatus>();

  for (const line of output.split('\n')) {
    if (line.length < 3) continue;

    const X = line[0]!;
    const Y = line[1]!;
    let filePath = line.slice(3);

    // Skip ignored files
    if (X === '!' && Y === '!') continue;

    // Handle renames: "old -> new" — we care about the new path
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ')[1]!;
    }

    // Git quotes paths with special characters; strip the quotes and unescape
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      // JSON.parse handles the escape sequences git uses
      filePath = JSON.parse(filePath) as string;
    }

    const isUntracked = X === '?' && Y === '?';
    const staged = !isUntracked && X !== ' ';

    let status: FileChange['status'] = 'modified';
    if (isUntracked || X === 'A') {
      status = 'added';
    } else if (X === 'D' || Y === 'D') {
      status = 'deleted';
    }

    result.set(filePath, { status, staged });
  }

  return result;
}

/**
 * Parse the output of `git diff --numstat` or `git diff --cached --numstat`.
 *
 * Each line is: <added>\t<removed>\t<path>
 * Binary files show '-' for both counts.
 */
export function parseNumstatOutput(
  output: string
): Map<string, { added: number; removed: number }> {
  const result = new Map<string, { added: number; removed: number }>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length < 3) continue;

    // Binary files use '-' — treat as 0
    const added = parts[0] === '-' ? 0 : parseInt(parts[0]!, 10);
    const removed = parts[1] === '-' ? 0 : parseInt(parts[1]!, 10);
    let filePath = parts[2]!;

    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = JSON.parse(filePath) as string;
    }

    result.set(filePath, {
      added: isNaN(added) ? 0 : added,
      removed: isNaN(removed) ? 0 : removed,
    });
  }

  return result;
}

/**
 * Split raw `git diff` output into per-file unified diff sections.
 * Returns a map of file path → raw unified diff string (everything from
 * the "--- " line through the end of the last hunk for that file).
 */
export function parseRawDiffSections(output: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!output.trim()) return result;

  const sections = output.split(/^diff --git /m).slice(1);

  for (const section of sections) {
    const plusMatch = section.match(/^\+\+\+ (.+)$/m);
    if (!plusMatch) continue;

    let rawPath = plusMatch[1]!.trim();
    if (rawPath === '/dev/null') {
      // For deletions, use the --- path
      const minusMatch = section.match(/^--- (.+)$/m);
      if (!minusMatch) continue;
      rawPath = minusMatch[1]!.trim();
      if (rawPath.startsWith('"') && rawPath.endsWith('"')) {
        rawPath = JSON.parse(rawPath) as string;
      }
      if (rawPath.startsWith('a/')) rawPath = rawPath.slice(2);
    } else {
      if (rawPath.startsWith('"') && rawPath.endsWith('"')) {
        rawPath = JSON.parse(rawPath) as string;
      }
      if (rawPath.startsWith('b/')) rawPath = rawPath.slice(2);
    }

    // Extract from --- line onward (the unified diff portion)
    const minusLineIdx = section.indexOf('--- ');
    if (minusLineIdx === -1) continue;
    const rawDiff = section.slice(minusLineIdx).trimEnd();

    result.set(rawPath, rawDiff);
  }

  return result;
}

/**
 * Parse unified `git diff` output into a map of file path → DiffHunk[].
 *
 * Handles standard changes and staged new files. Binary files and pure
 * deletions produce no entry (nothing useful to display).
 */
export function parseDiffOutput(output: string): Map<string, DiffHunk[]> {
  const result = new Map<string, DiffHunk[]>();
  if (!output.trim()) return result;

  // Each file section starts with "diff --git "; slice(1) drops the empty prefix.
  const sections = output.split(/^diff --git /m).slice(1);

  for (const section of sections) {
    // Resolve the target path from the "+++ " line:
    //   "+++ b/<path>"  → modified/added file
    //   "+++ /dev/null" → deleted file (skip — nothing to render)
    const plusMatch = section.match(/^\+\+\+ (.+)$/m);
    if (!plusMatch) continue; // binary file

    let rawPath = plusMatch[1]!.trim();
    if (rawPath === '/dev/null') continue; // pure deletion

    // Unquote git-quoted paths (must happen before b/ prefix stripping)
    if (rawPath.startsWith('"') && rawPath.endsWith('"')) {
      rawPath = JSON.parse(rawPath) as string;
    }

    // Strip the "b/" prefix git adds in unified diffs
    if (rawPath.startsWith('b/')) rawPath = rawPath.slice(2);

    const hunks: DiffHunk[] = [];

    // Each hunk starts with "@@"; split there and skip preamble
    for (const part of section.split(/^(?=@@)/m)) {
      if (!part.startsWith('@@')) continue;

      const hhMatch = part.match(/^(@@[^@]*@@[^\n]*)/);
      if (!hhMatch) continue;
      const header = hhMatch[1]!;

      const lines: DiffLine[] = [];
      for (const line of part.split('\n').slice(1)) {
        if (line.startsWith('+')) {
          lines.push({ type: 'added', content: line.slice(1) });
        } else if (line.startsWith('-')) {
          lines.push({ type: 'removed', content: line.slice(1) });
        } else if (line.startsWith(' ')) {
          lines.push({ type: 'context', content: line.slice(1) });
        }
        // skip "\ No newline at end of file" etc.
      }

      if (lines.length > 0) hunks.push({ header, lines });
    }

    if (hunks.length > 0) result.set(rawPath, hunks);
  }

  return result;
}

/**
 * Combine status + unstaged diff + staged diff into a FileChange[].
 * linesAdded/linesRemoved is the sum of staged and unstaged counts.
 */
export function buildFileChanges(
  statusOutput: string,
  diffOutput: string,
  cachedDiffOutput: string
): FileChange[] {
  const statusMap = parseStatusOutput(statusOutput);
  const diffMap = parseNumstatOutput(diffOutput);
  const cachedMap = parseNumstatOutput(cachedDiffOutput);
  const now = Date.now();
  const result: FileChange[] = [];

  for (const [filePath, { status, staged }] of statusMap) {
    const unstaged = diffMap.get(filePath) ?? { added: 0, removed: 0 };
    const cached = cachedMap.get(filePath) ?? { added: 0, removed: 0 };

    result.push({
      path: filePath,
      status,
      staged,
      linesAdded: unstaged.added + cached.added,
      linesRemoved: unstaged.removed + cached.removed,
      lastChangedAt: now,
    });
  }

  return result;
}

/** Run git status + diff queries against a worktree directory and return FileChange[]. */
export async function getFileChanges(worktreePath: string): Promise<FileChange[]> {
  const opts = { cwd: worktreePath, timeout: 10_000 };

  const [statusResult, numstatResult, cachedNumstatResult, diffResult, cachedDiffResult] =
    await Promise.allSettled([
      execFileAsync('git', ['status', '--porcelain', '-uall'], opts),
      execFileAsync('git', ['diff', '--numstat'], opts),
      execFileAsync('git', ['diff', '--cached', '--numstat'], opts),
      execFileAsync('git', ['diff'], opts),
      execFileAsync('git', ['diff', '--cached'], opts),
    ]);

  const statusOutput = statusResult.status === 'fulfilled' ? statusResult.value.stdout : '';
  const numstatOutput = numstatResult.status === 'fulfilled' ? numstatResult.value.stdout : '';
  const cachedNumstatOutput =
    cachedNumstatResult.status === 'fulfilled' ? cachedNumstatResult.value.stdout : '';
  const diffOutput = diffResult.status === 'fulfilled' ? diffResult.value.stdout : '';
  const cachedDiffOutput =
    cachedDiffResult.status === 'fulfilled' ? cachedDiffResult.value.stdout : '';

  const changes = buildFileChanges(statusOutput, numstatOutput, cachedNumstatOutput);

  const unstagedDiffs = parseDiffOutput(diffOutput);
  const stagedDiffs = parseDiffOutput(cachedDiffOutput);
  const unstagedRaw = parseRawDiffSections(diffOutput);
  const stagedRaw = parseRawDiffSections(cachedDiffOutput);

  // Populate diff hunks, rawDiff, and fix line counts for untracked files
  await Promise.all(
    changes.map(async (fc) => {
      if (fc.status === 'added' && !fc.staged) {
        // Untracked file: git diff has no output for it.
        // Read the file to get content, line count, and synthetic diff.
        try {
          const content = await fs.promises.readFile(path.join(worktreePath, fc.path), 'utf8');
          if (content.length > 0) {
            const rawLines = content.split('\n');
            // Don't count a trailing empty string from a final newline
            const lines = content.endsWith('\n') ? rawLines.slice(0, -1) : rawLines;
            fc.linesAdded = lines.length;
            fc.diff = [
              {
                header: `@@ -0,0 +1,${lines.length} @@`,
                lines: lines.map((l) => ({ type: 'added' as const, content: l })),
              },
            ];
            // Build raw unified diff for untracked files
            fc.rawDiff = [
              `--- /dev/null`,
              `+++ b/${fc.path}`,
              `@@ -0,0 +1,${lines.length} @@`,
              ...lines.map((l) => `+${l}`),
            ].join('\n');
          }
        } catch {
          // binary or unreadable — leave linesAdded = 0, diff = undefined
        }
      } else {
        // Tracked file: combine unstaged and staged hunks
        const unstaged = unstagedDiffs.get(fc.path) ?? [];
        const staged = stagedDiffs.get(fc.path) ?? [];
        fc.diff = [...unstaged, ...staged];

        // Combine raw diff sections
        const rawParts = [unstagedRaw.get(fc.path), stagedRaw.get(fc.path)].filter(Boolean);
        if (rawParts.length > 0) {
          fc.rawDiff = rawParts.join('\n');
        }
      }
    })
  );

  return changes;
}
