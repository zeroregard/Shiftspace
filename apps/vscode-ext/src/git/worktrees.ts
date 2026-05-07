/* eslint-disable max-lines -- TODO: decompose in a follow-up PR */
import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorktreeState, WorktreeBadge } from '@shiftspace/renderer';
import { gitReadOnly, gitWrite } from './git-utils';
import { log } from '../logger';
import { reportError, reportUnexpectedState } from '../telemetry';

/** Relative path (from worktree root) of the optional per-worktree config file. */
export const WORKTREE_CONFIG_FILENAME = '.shiftspace-worktree.json';

const VALID_COLORS = ['neutral', 'info', 'success', 'warning', 'danger'] as const;
type ValidColor = (typeof VALID_COLORS)[number];

export interface WorktreeConfig {
  badge?: WorktreeBadge;
  /** Plan file path: relative to the worktree root, an absolute path, or an http/https URL. */
  planPath?: string;
}

/**
 * Read and validate the optional `.shiftspace-worktree.json` in a worktree
 * root. Returns the parsed config, or an empty object if the file doesn't
 * exist, is malformed, or fails validation of every field.
 *
 * Schema (v3):
 *   {
 *     "planPath": "PLAN.md",
 *     "badge": {
 *       "label": "stale",
 *       "color": "warning",
 *       "description": "Needs rebase against main."
 *     }
 *   }
 *
 * - `planPath` is a non-empty string: a relative path (resolved from the worktree
 *   root), an absolute filesystem path, or an http/https URL.
 * - `badge.label` is free-form text.
 * - `badge.color` (optional) is one of: neutral, info, success, warning, danger.
 *   Constraining color to a semantic set keeps badges theme-coherent.
 * - `badge.description` (optional) is free-form text shown on hover.
 *
 * Invalid fields are dropped individually — a bad `badge` never poisons a
 * good `planPath` and vice versa.
 */
export async function readWorktreeConfig(worktreePath: string): Promise<WorktreeConfig> {
  const filePath = path.join(worktreePath, WORKTREE_CONFIG_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {};
    log.warn(`readWorktreeConfig: failed to read ${filePath}:`, err);
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn(`readWorktreeConfig: invalid JSON in ${filePath}:`, err);
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null) return {};

  return {
    badge: parseBadge(parsed, filePath),
    planPath: parsePlanPath(parsed, filePath),
  };
}

function parseBadge(parsed: unknown, filePath: string): WorktreeBadge | undefined {
  const badge = (parsed as { badge?: unknown }).badge;
  if (badge === undefined) return undefined;
  if (typeof badge !== 'object' || badge === null) return undefined;

  const b = badge as Record<string, unknown>;
  if (typeof b['label'] !== 'string') {
    log.warn(`readWorktreeConfig: invalid badge shape in ${filePath}`);
    return undefined;
  }

  let color: ValidColor | undefined;
  if (b['color'] !== undefined) {
    if (typeof b['color'] !== 'string' || !VALID_COLORS.includes(b['color'] as ValidColor)) {
      log.warn(`readWorktreeConfig: invalid badge color in ${filePath}`);
      return undefined;
    }
    color = b['color'] as ValidColor;
  }

  let description: string | undefined;
  if (b['description'] !== undefined) {
    if (typeof b['description'] !== 'string') {
      log.warn(`readWorktreeConfig: invalid badge description in ${filePath}`);
    } else if (b['description'].length > 0) {
      description = b['description'];
    }
  }

  return {
    label: b['label'],
    ...(color ? { color } : {}),
    ...(description ? { description } : {}),
  };
}

function parsePlanPath(parsed: unknown, filePath: string): string | undefined {
  const planPath = (parsed as { planPath?: unknown }).planPath;
  if (planPath === undefined) return undefined;
  if (typeof planPath !== 'string' || planPath.length === 0) {
    log.warn(`readWorktreeConfig: invalid planPath in ${filePath}`);
    return undefined;
  }
  return planPath;
}

/** Deep equality check for two optional badges. */
export function badgesEqual(a: WorktreeBadge | undefined, b: WorktreeBadge | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.label === b.label && a.color === b.color && a.description === b.description;
}

/**
 * Parse the output of `git worktree list --porcelain` into WorktreeState[].
 * Bare worktrees are skipped.
 */
export function parseWorktreeOutput(output: string): WorktreeState[] {
  const blocks = output
    .trim()
    .split(/\n\n+/)
    .filter((b) => b.trim().length > 0);
  const worktrees: WorktreeState[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n');
    let path = '';
    let branch = '';
    let headCommit = '';
    let isBare = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length).trim();
      } else if (line.startsWith('branch ')) {
        branch = line
          .slice('branch '.length)
          .trim()
          .replace(/^refs\/heads\//, '');
      } else if (line.startsWith('HEAD ')) {
        headCommit = line.slice('HEAD '.length).trim().slice(0, 8);
      } else if (line === 'bare') {
        isBare = true;
      }
    }

    if (isBare || !path) continue;

    // Detached HEAD: use short commit hash as branch name
    const branchName = branch || headCommit || 'HEAD';

    // Use path as stable ID.
    // - Unique per worktree
    // - Stable across git output reordering
    // - Works for detached HEAD and duplicate branches
    const stableId = path;

    worktrees.push({
      id: stableId,
      path,
      branch: branchName,
      files: [],
      diffMode: { type: 'working' },
      defaultBranch: 'main',
      isMainWorktree: i === 0,
      lastActivityAt: Date.now(),
    });
  }

  return worktrees;
}

/** Detect all worktrees for the repo rooted at `repoRoot`. */
export async function detectWorktrees(repoRoot: string): Promise<WorktreeState[]> {
  try {
    const { stdout } = await gitReadOnly(['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      timeout: 5000,
    });
    const worktrees = parseWorktreeOutput(stdout);
    // Read per-worktree configs in parallel. Failures are already absorbed
    // by readWorktreeConfig, so this never throws.
    await Promise.all(
      worktrees.map(async (wt) => {
        const cfg = await readWorktreeConfig(wt.path);
        wt.badge = cfg.badge;
        wt.planPath = cfg.planPath;
      })
    );
    return worktrees;
  } catch (err) {
    reportError(err as Error, { context: 'detectWorktrees', root: repoRoot });
    return [];
  }
}

/**
 * Resolve the git repo root starting from `dirPath` (must be a directory).
 * Returns null if not inside a git repository.
 */
export async function getGitRoot(dirPath: string): Promise<string | null> {
  try {
    const { stdout } = await gitReadOnly(['rev-parse', '--show-toplevel'], {
      cwd: dirPath,
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Detect the repo's default/main branch name.
 *
 * Strategy:
 *  1. Try `git symbolic-ref refs/remotes/origin/HEAD` (set by `git clone`).
 *  2. Check common branch names (main, master, develop).
 *  3. Fall back to 'main'.
 */
export async function getDefaultBranch(gitRoot: string): Promise<string> {
  // Try 1: git symbolic-ref
  try {
    const { stdout } = await gitReadOnly(['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: gitRoot,
      timeout: 5000,
    });
    return stdout.trim().replace('refs/remotes/origin/', '');
  } catch {
    // Not set — fall through
  }

  // Try 2: check common names
  for (const candidate of ['main', 'master', 'develop']) {
    try {
      await gitReadOnly(['rev-parse', '--verify', candidate], {
        cwd: gitRoot,
        timeout: 5000,
      });
      return candidate;
    } catch {
      continue;
    }
  }

  // Fallback
  return 'main';
}

/**
 * List branches sorted by most recent commit.
 */
export async function listBranches(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await gitReadOnly(
      ['branch', '--format=%(refname:short)', '--sort=-committerdate'],
      { cwd: repoRoot, timeout: 5000 }
    );
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Checkout a branch in the given worktree directory.
 * Throws if the checkout fails (e.g. uncommitted changes, branch doesn't exist).
 */
export async function checkoutBranch(worktreePath: string, branch: string): Promise<void> {
  await gitWrite(['checkout', branch], { cwd: worktreePath, timeout: 10_000 });
}

/** Fetch all remotes and prune stale tracking branches. */
export async function fetchRemote(repoRoot: string): Promise<void> {
  await gitWrite(['fetch', '--all', '--prune'], { cwd: repoRoot, timeout: 60_000 });
}

/**
 * Resolve the git directory for a worktree path.
 * For linked worktrees this returns e.g. `/repo/.git/worktrees/<name>`.
 * For the main worktree it returns `/repo/.git`.
 */
async function resolveGitDir(worktreePath: string): Promise<string> {
  const { stdout } = await gitReadOnly(['rev-parse', '--git-dir'], {
    cwd: worktreePath,
    timeout: 5000,
  });
  return path.resolve(worktreePath, stdout.trim());
}

/**
 * Remove stale git lock files (index.lock) from a worktree's git directory.
 * A lock file is considered stale if it's older than `maxAgeMs` (default 5s).
 * Returns true if a stale lock was cleaned up.
 */
async function cleanStaleLockFile(worktreePath: string, maxAgeMs = 5000): Promise<boolean> {
  try {
    const gitDir = await resolveGitDir(worktreePath);
    const lockFile = path.join(gitDir, 'index.lock');
    const stat = await fs.stat(lockFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > maxAgeMs) {
      await fs.unlink(lockFile);
      return true;
    }
    // Lock file exists but is fresh — a git operation is likely in progress
    return false;
  } catch {
    // Lock file doesn't exist — nothing to do
    return true;
  }
}

/**
 * Check if a worktree is safe for a branch swap.
 * Returns a human-readable error string if unsafe, or null if safe.
 */
export async function checkWorktreeSafety(worktreePath: string): Promise<string | null> {
  // Detached HEAD check
  try {
    await gitReadOnly(['symbolic-ref', '--quiet', 'HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
  } catch {
    return 'Worktree is in detached HEAD state';
  }

  // Merge in progress check
  try {
    await gitReadOnly(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    return 'A merge is in progress in this worktree';
  } catch {
    // Not merging — good
  }

  // Rebase in progress check
  try {
    await gitReadOnly(['rev-parse', '--quiet', '--verify', 'REBASE_HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    return 'A rebase is in progress in this worktree';
  } catch {
    // Not rebasing — good
  }

  // Merge conflict check (unmerged paths)
  try {
    const { stdout } = await gitReadOnly(['diff', '--name-only', '--diff-filter=U'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    if (stdout.trim()) {
      const conflicted = stdout.trim().split('\n').slice(0, 3).join(', ');
      return `Worktree has merge conflicts: ${conflicted}`;
    }
  } catch {
    // If this fails, ignore — not a blocking condition
  }

  // Lock file check — try to clean stale locks, fail if a fresh lock exists
  const lockCleaned = await cleanStaleLockFile(worktreePath);
  if (!lockCleaned) {
    return 'A git operation is in progress (index.lock exists). Try again in a moment.';
  }

  return null;
}

/**
 * Recover a worktree stuck on a `_shiftspace_temp_swap*` branch.
 *
 * This can happen if the extension crashed mid-swap before it could check out
 * the real branch and delete the temp one. Recovery strategy:
 *  1. `git checkout -` to return to the previously checked-out branch.
 *  2. Force-delete the temp branch.
 *
 * Returns true if recovery was attempted (regardless of partial success).
 */
export async function recoverStuckTempBranch(worktreePath: string): Promise<boolean> {
  let currentBranch: string;
  try {
    const { stdout } = await gitReadOnly(['symbolic-ref', '--short', 'HEAD'], {
      cwd: worktreePath,
      timeout: 5000,
    });
    currentBranch = stdout.trim();
  } catch {
    return false;
  }

  if (!currentBranch.startsWith('_shiftspace_temp_swap')) {
    return false;
  }

  log.warn(
    `recoverStuckTempBranch: ${worktreePath} is on temp branch "${currentBranch}" — recovering`
  );
  // A stuck temp branch means a previous swap crashed mid-operation. We want
  // to know how often this happens in the wild.
  reportUnexpectedState('git.swap.stuckTempBranch');

  try {
    await gitWrite(['checkout', '-'], { cwd: worktreePath, timeout: 10_000 });
  } catch (e) {
    log.error('recoverStuckTempBranch: checkout - failed:', e);
    reportError(e instanceof Error ? e : new Error(String(e)), {
      context: 'recoverStuckTempBranch.checkout',
    });
    // Continue to attempt temp branch deletion even if checkout failed
  }

  try {
    await gitWrite(['branch', '-D', currentBranch], { cwd: worktreePath, timeout: 10_000 });
  } catch (e) {
    log.error('recoverStuckTempBranch: branch -D failed:', e);
    reportError(e instanceof Error ? e : new Error(String(e)), {
      context: 'recoverStuckTempBranch.deleteBranch',
    });
  }

  return true;
}

/** Find a unique temp branch name, avoiding collisions. */
async function findUniqueTempBranchName(worktreePath: string): Promise<string> {
  const base = '_shiftspace_temp_swap';
  try {
    await gitReadOnly(['rev-parse', '--quiet', '--verify', base], {
      cwd: worktreePath,
      timeout: 5000,
    });
    // Branch already exists — add timestamp suffix
    return `${base}_${Date.now()}`;
  } catch {
    return base;
  }
}

/** Pop a stash identified by its message from the given worktree's stash list. */
async function popStashByMessage(worktreePath: string, message: string): Promise<void> {
  const { stdout } = await gitReadOnly(['stash', 'list'], {
    cwd: worktreePath,
    timeout: 5000,
  });
  for (const line of stdout.trim().split('\n')) {
    if (line.includes(message)) {
      const match = line.match(/^(stash@\{\d+\})/);
      if (match) {
        await gitWrite(['stash', 'pop', match[1]!], {
          cwd: worktreePath,
          timeout: 30_000,
        });
        return;
      }
    }
  }
  // Stash not found — nothing to pop
}

/** Attempt to roll back a failed swap. Returns a note string for the error message. */
async function rollbackSwap(ctx: {
  worktreeAPath: string;
  worktreeBPath: string;
  branchA: string;
  branchB: string;
  tempBranch: string;
  tempBranchCreated: boolean;
  bCheckedOut: boolean;
  stashedA: boolean;
  stashedB: boolean;
}): Promise<string> {
  const rollbackIssues: string[] = [];

  if (ctx.tempBranchCreated) {
    await rollbackBranches(ctx, rollbackIssues);
    await deleteTempBranch(ctx.worktreeAPath, ctx.tempBranch, rollbackIssues);
  }

  // Pop stashes back to their original worktrees
  if (ctx.stashedA) {
    try {
      await popStashByMessage(ctx.worktreeAPath, 'shiftspace-swap-A');
    } catch {
      // Stash is preserved in the list — user can recover manually
    }
  }
  if (ctx.stashedB) {
    try {
      await popStashByMessage(ctx.worktreeBPath, 'shiftspace-swap-B');
    } catch {
      // Stash is preserved in the list
    }
  }

  return rollbackIssues.length > 0 ? ` Rollback issues: ${rollbackIssues.join('; ')}` : '';
}

async function rollbackBranches(
  ctx: {
    worktreeAPath: string;
    worktreeBPath: string;
    branchA: string;
    branchB: string;
    bCheckedOut: boolean;
  },
  issues: string[]
): Promise<void> {
  if (ctx.bCheckedOut) {
    try {
      await gitWrite(['checkout', ctx.branchB], { cwd: ctx.worktreeBPath, timeout: 10_000 });
    } catch (e) {
      issues.push(`restore B to ${ctx.branchB}: ${(e as Error).message}`);
    }
  }
  try {
    await gitWrite(['checkout', ctx.branchA], { cwd: ctx.worktreeAPath, timeout: 10_000 });
  } catch (e) {
    issues.push(`restore A to ${ctx.branchA}: ${(e as Error).message}`);
  }
}

async function deleteTempBranch(cwd: string, tempBranch: string, issues: string[]): Promise<void> {
  try {
    await gitWrite(['branch', '-d', tempBranch], { cwd, timeout: 10_000 });
  } catch {
    try {
      await gitWrite(['branch', '-D', tempBranch], { cwd, timeout: 10_000 });
    } catch (e2) {
      issues.push(`delete temp branch: ${(e2 as Error).message}`);
    }
  }
}

interface SwapBranchesOptions {
  /** Path to the linked worktree (the source of the swap). */
  worktreeAPath: string;
  /** Branch currently checked out in worktreeA. */
  branchA: string;
  /** Path to the primary worktree (the swap target). */
  worktreeBPath: string;
  /** Branch currently checked out in worktreeB. */
  branchB: string;
  /** Optional progress callback for step-by-step status. */
  onProgress?: (message: string) => void;
}

/**
 * Swap branches between two worktrees.
 *
 * After the swap:
 *  - worktreeA will be on branchB
 *  - worktreeB will be on branchA
 *  - Uncommitted changes are stashed and re-applied to the correct worktree.
 *
 * Uses a temporary branch to avoid the "branch already checked out" constraint.
 * Throws on failure after attempting rollback.
 */
export async function swapBranches(opts: SwapBranchesOptions): Promise<void> {
  const { worktreeAPath, branchA, worktreeBPath, branchB, onProgress } = opts;
  const progress = onProgress ?? (() => {});

  let stashedA = false;
  let stashedB = false;
  let tempBranch = '';
  let tempBranchCreated = false;
  let bCheckedOut = false;

  try {
    // ── Step 0: Clean stale lock files from both worktrees ────────────────
    await cleanStaleLockFile(worktreeAPath);
    await cleanStaleLockFile(worktreeBPath);

    // ── Step 1: Stash uncommitted changes ──────────────────────────────────
    progress('Stashing changes...');

    const { stdout: statusA } = await gitReadOnly(['status', '--porcelain'], {
      cwd: worktreeAPath,
      timeout: 5000,
    });
    if (statusA.trim()) {
      await gitWrite(['stash', 'push', '-u', '-m', 'shiftspace-swap-A'], {
        cwd: worktreeAPath,
        timeout: 30_000,
      });
      stashedA = true;
    }

    const { stdout: statusB } = await gitReadOnly(['status', '--porcelain'], {
      cwd: worktreeBPath,
      timeout: 5000,
    });
    if (statusB.trim()) {
      await gitWrite(['stash', 'push', '-u', '-m', 'shiftspace-swap-B'], {
        cwd: worktreeBPath,
        timeout: 30_000,
      });
      stashedB = true;
    }

    // ── Step 2: Create temp branch on A (frees branchA) ───────────────────
    progress('Swapping branches...');
    tempBranch = await findUniqueTempBranchName(worktreeAPath);
    await gitWrite(['checkout', '-b', tempBranch], {
      cwd: worktreeAPath,
      timeout: 10_000,
    });
    tempBranchCreated = true;

    // ── Step 3: Check out branchA on B (branchA is now free) ──────────────
    await gitWrite(['checkout', branchA], {
      cwd: worktreeBPath,
      timeout: 10_000,
    });
    bCheckedOut = true;

    // ── Step 4: Check out branchB on A (branchB is now free) ──────────────
    await gitWrite(['checkout', branchB], {
      cwd: worktreeAPath,
      timeout: 10_000,
    });

    // ── Step 5: Delete temp branch ────────────────────────────────────────
    // Use -D (force) because the temp branch was created at an arbitrary point
    // and is never merged — soft delete (-d) will fail with "not fully merged".
    await gitWrite(['branch', '-D', tempBranch], {
      cwd: worktreeAPath,
      timeout: 10_000,
    });
    tempBranchCreated = false;

    // ── Step 6: Restore stashes (cross-applied) ───────────────────────────
    // A's stash → B (B is now on branchA, where A's changes belong)
    // B's stash → A (A is now on branchB, where B's changes belong)
    progress('Restoring changes...');
    if (stashedA) {
      try {
        await popStashByMessage(worktreeBPath, 'shiftspace-swap-A');
      } catch (err) {
        log.error('swapBranches: failed to pop stash A on B:', err);
        reportError(err instanceof Error ? err : new Error(String(err)), {
          context: 'swapBranches.popStashA',
        });
        // Non-fatal: stash is preserved in the stash list
      }
    }
    if (stashedB) {
      try {
        await popStashByMessage(worktreeAPath, 'shiftspace-swap-B');
      } catch (err) {
        log.error('swapBranches: failed to pop stash B on A:', err);
        reportError(err instanceof Error ? err : new Error(String(err)), {
          context: 'swapBranches.popStashB',
        });
      }
    }
  } catch (err) {
    const rollbackNote = await rollbackSwap({
      worktreeAPath,
      worktreeBPath,
      branchA,
      branchB,
      tempBranch,
      tempBranchCreated,
      bCheckedOut,
      stashedA,
      stashedB,
    });
    throw new Error(`${(err as Error).message}${rollbackNote}`);
  }
}

/**
 * Remove a linked (non-primary) worktree.
 * Uses `git worktree remove` with optional `--force` for worktrees with modifications.
 *
 * Runs from the primary repo root rather than the worktree being removed —
 * running git inside a directory that's about to be deleted is wasteful and
 * can interact poorly with filesystem watchers.
 */
export async function removeWorktree(
  worktreePath: string,
  gitRoot: string,
  force = false
): Promise<void> {
  const args = ['worktree', 'remove', worktreePath];
  if (force) args.push('--force');
  await gitWrite(args, { cwd: gitRoot, timeout: 30_000 });
}

/**
 * Prune stale worktree metadata from `.git/worktrees`. Fast — only touches
 * git's bookkeeping, never scans the worktree directory contents.
 *
 * Used as part of the fast-delete path: we rename the worktree dir first
 * (making it invisible to git) and then prune to clean the metadata, so the
 * expensive recursive directory delete can happen off the critical path.
 */
export async function pruneWorktrees(gitRoot: string): Promise<void> {
  await gitWrite(['worktree', 'prune'], { cwd: gitRoot, timeout: 10_000 });
}

/**
 * Move/rename a worktree to a new path.
 * Uses `git worktree move <old-path> <new-path>`.
 */
export async function moveWorktree(
  oldPath: string,
  newPath: string,
  gitRoot: string
): Promise<void> {
  await gitWrite(['worktree', 'move', oldPath, newPath], {
    cwd: gitRoot,
    timeout: 10_000,
  });
}

/**
 * Check whether the directory is a git repository.
 * Returns 'ok', 'not-repo', or 'no-git' (git binary missing).
 */
export async function checkGitAvailability(dir: string): Promise<'ok' | 'not-repo' | 'no-git'> {
  try {
    await gitReadOnly(['rev-parse', '--git-dir'], {
      cwd: dir,
      timeout: 5000,
    });
    return 'ok';
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return 'no-git';
    }
    return 'not-repo';
  }
}
