/**
 * Real-repository regression test for the shallow-history explosion.
 *
 * With a shallow clone whose history stops before the branch point,
 * `git merge-base` finds no common ancestor. The counter used to fall back to
 * diffing against the base *tip*, which renders everyone else's work on the
 * base reversed — a 1-file branch reported dozens of files and thousands of
 * deleted lines that weren't its own. Now the diff is reported as
 * unmeasurable instead, and the card falls back to working changes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getBranchDiffStats, toDiffStats } from '../../src/git/branch-stats';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let root: string;
let origin: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'shiftspace-branch-stats-'));
  origin = join(root, 'origin');

  // Upstream: a branch with one small commit, then staging moves far ahead.
  git(root, 'init', '-q', '-b', 'staging', origin);
  git(origin, 'config', 'user.email', 't@t');
  git(origin, 'config', 'user.name', 'T');
  writeFileSync(join(origin, 'base.txt'), 'l1\nl2\nl3\n');
  git(origin, 'add', '.');
  git(origin, 'commit', '-qm', 'base');
  git(origin, 'checkout', '-qb', 'feature');
  writeFileSync(join(origin, 'slice.txt'), 's1\ns2\n');
  git(origin, 'add', '.');
  git(origin, 'commit', '-qm', 'feature work');
  git(origin, 'checkout', '-q', 'staging');
  for (let i = 0; i < 5; i++) {
    writeFileSync(
      join(origin, `staging-${i}.txt`),
      Array.from({ length: 40 }, (_, n) => n).join('\n')
    );
  }
  git(origin, 'add', '.');
  git(origin, 'commit', '-qm', 'staging moved ahead');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('getBranchDiffStats against a real repository', () => {
  it('reports the true branch diff in a full clone', async () => {
    const clone = join(root, 'full');
    git(root, 'clone', '-q', '--branch', 'feature', `file://${origin}`, clone);
    git(clone, 'fetch', '-q', 'origin', '+refs/heads/staging:refs/remotes/origin/staging');

    const stats = toDiffStats((await getBranchDiffStats(clone, 'staging'))!);
    expect(stats).toEqual({ fileCount: 1, linesAdded: 2, linesRemoved: 0 });
  });

  it('reports the diff as unmeasurable in a shallow clone, never the reversed base diff', async () => {
    const clone = join(root, 'shallow');
    // --depth 1 over file:// creates a genuine shallow boundary: the merge
    // base with staging exists upstream but is unreachable locally.
    git(root, 'clone', '-q', '--depth', '1', '--branch', 'feature', `file://${origin}`, clone);
    git(
      clone,
      'fetch',
      '-q',
      '--depth',
      '1',
      'origin',
      '+refs/heads/staging:refs/remotes/origin/staging'
    );

    expect(await getBranchDiffStats(clone, 'staging')).toBeNull();
  });
});
