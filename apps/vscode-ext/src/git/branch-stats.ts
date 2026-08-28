import * as fs from 'fs';
import * as path from 'path';
import type { DiffStats } from '@shiftspace/renderer';
import { gitReadOnly } from './git-utils';
import { resolveBranchDiffBase } from './branch-base';
import { parseNumstatOutput } from './status';

/**
 * Everything that separates this worktree from `baseBranch`: the commits on
 * the branch **and** the work not committed yet.
 *
 * Measured from the merge base to the working tree, so it answers "how big is
 * this branch going to be" rather than "how big is it right now" — an agent
 * mid-task has most of its work uncommitted, and a counter that ignored that
 * would read zero until the commit landed.
 *
 * Three parts, matching what the working-changes counter already counts:
 *  - `git diff <merge-base>` covers committed, staged and unstaged changes to
 *    tracked files in one pass (the working tree is the right-hand side, so
 *    staged and unstaged edits both land in it).
 *  - untracked files are invisible to `git diff`, so they're listed
 *    separately and counted by reading them.
 *
 * Only line totals are gathered — the worktree card needs numbers, not hunks,
 * and this runs for every worktree whenever one of them changes.
 *
 * Returns null when the diff cannot be measured because the branch shares no
 * reachable history with the base — a shallow clone whose history stops
 * before the branch point, or genuinely unrelated histories. Diffing against
 * the base tip instead is NOT an acceptable stand-in: with the base ahead of
 * the branch, that shows everyone else's work on the base reversed (their
 * additions as this branch's deletions), inflating a 20-file branch into a
 * six-hundred-file lie.
 */
export async function getBranchDiffStats(
  worktreePath: string,
  baseBranch: string
): Promise<Map<string, { added: number; removed: number }> | null> {
  const opts = { cwd: worktreePath, timeout: 10_000 };
  const base = await resolveBranchDiffBase(worktreePath, baseBranch);
  const mergeBase = await resolveMergeBase(worktreePath, base);
  if (mergeBase === null) return null;

  const [trackedResult, untrackedResult] = await Promise.allSettled([
    gitReadOnly(['diff', '--numstat', mergeBase], opts),
    gitReadOnly(['ls-files', '--others', '--exclude-standard'], opts),
  ]);

  const perFile = parseNumstatOutput(
    trackedResult.status === 'fulfilled' ? trackedResult.value.stdout : ''
  );

  const untracked =
    untrackedResult.status === 'fulfilled'
      ? untrackedResult.value.stdout.split('\n').filter((line) => line.trim().length > 0)
      : [];

  await Promise.all(
    untracked.map(async (filePath) => {
      perFile.set(filePath, { added: await countLines(worktreePath, filePath), removed: 0 });
    })
  );

  return perFile;
}

/**
 * The commit the branch diverged from, so the comparison covers what this
 * branch did and not what landed on the base since. Equivalent to the
 * left-hand side of `base...HEAD`, spelled out because the working tree can't
 * be one side of a three-dot diff.
 *
 * Returns null when git answers definitively that there is no merge base
 * (exit 1: shallow history, unborn HEAD, unrelated branches) — the caller
 * reports the diff as unmeasurable. Transient failures (timeout, lock
 * contention) propagate instead, so a caller holding a previous value keeps
 * it rather than flickering to the fallback and back.
 */
async function resolveMergeBase(worktreePath: string, base: string): Promise<string | null> {
  try {
    const { stdout } = await gitReadOnly(['merge-base', base, 'HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch (err) {
    // `git merge-base` exits 1 with nothing on stderr when the commits share
    // no reachable ancestor. gitReadOnly rethrows that raw (it only wraps
    // errors that carry stderr), so the numeric exit code survives here.
    if ((err as { code?: unknown }).code === 1) return null;
    throw err;
  }
}

/**
 * Line count of an untracked file, matching how the working-changes counter
 * sizes them. Binary or unreadable files count as a changed file with no
 * lines rather than failing the whole measurement.
 */
async function countLines(worktreePath: string, filePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(path.join(worktreePath, filePath), 'utf8');
    if (content.length === 0) return 0;
    const lines = content.split('\n');
    // A trailing newline doesn't make an extra line.
    return content.endsWith('\n') ? lines.length - 1 : lines.length;
  } catch {
    return 0;
  }
}

/** Fold per-file numstat entries into the totals shown on a worktree card. */
export function toDiffStats(perFile: Map<string, { added: number; removed: number }>): DiffStats {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const { added, removed } of perFile.values()) {
    linesAdded += added;
    linesRemoved += removed;
  }
  return { fileCount: perFile.size, linesAdded, linesRemoved };
}
