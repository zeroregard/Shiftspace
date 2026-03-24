import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { FileChange } from '@shiftspace/renderer';

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

/**
 * Count the lines in a file the same way git does: number of newline-terminated
 * lines, plus one extra if the file is non-empty and has no trailing newline.
 * Returns 0 for empty or unreadable files (e.g. binary).
 */
async function countFileLines(absolutePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(absolutePath, 'utf8');
    if (content.length === 0) return 0;
    const newlines = (content.match(/\n/g) ?? []).length;
    return content.endsWith('\n') ? newlines : newlines + 1;
  } catch {
    return 0; // binary or unreadable
  }
}

/** Run git status + diff queries against a worktree directory and return FileChange[]. */
export async function getFileChanges(worktreePath: string): Promise<FileChange[]> {
  const opts = { cwd: worktreePath, timeout: 5000 };

  const [statusResult, diffResult, cachedResult] = await Promise.allSettled([
    execFileAsync('git', ['status', '--porcelain', '-uall'], opts),
    execFileAsync('git', ['diff', '--numstat'], opts),
    execFileAsync('git', ['diff', '--cached', '--numstat'], opts),
  ]);

  const statusOutput = statusResult.status === 'fulfilled' ? statusResult.value.stdout : '';
  const diffOutput = diffResult.status === 'fulfilled' ? diffResult.value.stdout : '';
  const cachedOutput = cachedResult.status === 'fulfilled' ? cachedResult.value.stdout : '';

  const changes = buildFileChanges(statusOutput, diffOutput, cachedOutput);

  // git diff --numstat only covers tracked files. Untracked new files (status=added,
  // staged=false) won't have line counts — read them directly to fill in linesAdded.
  await Promise.all(
    changes
      .filter((fc) => fc.status === 'added' && !fc.staged && fc.linesAdded === 0)
      .map(async (fc) => {
        fc.linesAdded = await countFileLines(path.join(worktreePath, fc.path));
      })
  );

  return changes;
}
