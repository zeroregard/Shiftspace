import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { WorktreeState } from '@shiftspace/renderer';
import { log } from '../logger';
import { reportUnexpectedState } from '../telemetry';
import type { McpErrorResponse } from './protocol';

/** Normalize a path by resolving symlinks and removing trailing slashes. */
function normalizePath(p: string): string {
  try {
    return fs.realpathSync(p).replace(/\/+$/, '');
  } catch {
    // Path may not exist (e.g. stale worktree) — fall back to basic normalization.
    return path.resolve(p).replace(/\/+$/, '');
  }
}

/**
 * Resolve which worktree an MCP call targets. With no `cwd` we fall back to
 * the first available worktree; with a `cwd` we run `git rev-parse` and
 * match against the known worktree paths (after symlink resolution).
 */
export function resolveWorktree(
  worktrees: WorktreeState[],
  cwd: string | undefined
): WorktreeState | null {
  if (worktrees.length === 0) {
    log.warn('[MCP] resolveWorktree: no worktrees available');
    reportUnexpectedState('mcp.resolveWorktree.noWorktrees', {
      hasCwd: String(Boolean(cwd)),
    });
    return null;
  }
  if (!cwd) {
    return worktrees[0] ?? null;
  }

  let gitRoot: string;
  try {
    gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch (err) {
    log.warn('[MCP] resolveWorktree: git rev-parse failed for cwd="%s":', cwd, err);
    reportUnexpectedState('mcp.resolveWorktree.revParseFailed', {
      errorName: err instanceof Error ? err.name : 'unknown',
    });
    return null;
  }

  // Resolve symlinks so that paths like /var/... and /private/var/... match on macOS.
  const resolvedGitRoot = normalizePath(gitRoot);
  const match = worktrees.find((wt) => normalizePath(wt.path) === resolvedGitRoot) ?? null;

  if (!match) {
    log.warn(
      '[MCP] resolveWorktree: no match for cwd="%s" (gitRoot="%s", resolved="%s"). Known worktree paths: %s',
      cwd,
      gitRoot,
      resolvedGitRoot,
      JSON.stringify(worktrees.map((wt) => wt.path))
    );
    reportUnexpectedState('mcp.resolveWorktree.noMatchForCwd', {
      worktreeCount: String(worktrees.length),
    });
  }
  return match;
}

/** Build the canonical "no worktree found" error response, with diag info. */
export function noWorktreeError(
  worktrees: WorktreeState[],
  cwd: string | undefined
): McpErrorResponse {
  const detail: McpErrorResponse = {
    error: 'No worktree found',
    cwd: cwd ?? '(none — used first worktree fallback)',
    availableWorktrees: worktrees.map((wt) => ({ id: wt.id, path: wt.path, branch: wt.branch })),
  };
  if (cwd) {
    try {
      detail.resolvedGitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {
      detail.resolvedGitRoot = '(git rev-parse failed)';
    }
  }
  return detail;
}
