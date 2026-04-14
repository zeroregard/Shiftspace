import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseWorktreeOutput,
  getDefaultBranch,
  getGitRoot,
  listBranches,
  readWorktreeBadge,
  badgesEqual,
  WORKTREE_CONFIG_FILENAME,
} from '../../src/git/worktrees';

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf8');

describe('parseWorktreeOutput', () => {
  it('parses a single (main) worktree', () => {
    const output = fixture('worktree-list-single.txt');
    const worktrees = parseWorktreeOutput(output);
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]).toMatchObject({
      id: '/home/user/project',
      path: '/home/user/project',
      branch: 'main',
      files: [],
    });
  });

  it('parses multiple worktrees', () => {
    const output = fixture('worktree-list-multiple.txt');
    const worktrees = parseWorktreeOutput(output);
    expect(worktrees).toHaveLength(3);
    expect(worktrees[0]).toMatchObject({ path: '/home/user/project', branch: 'main' });
    expect(worktrees[1]).toMatchObject({
      path: '/home/user/project-feature-auth',
      branch: 'feature/auth',
    });
    expect(worktrees[2]).toMatchObject({
      path: '/home/user/project-fix-login',
      branch: 'fix/login-redirect',
    });
  });

  it('strips refs/heads/ prefix from branch name', () => {
    const output = fixture('worktree-list-single.txt');
    const [wt] = parseWorktreeOutput(output);
    expect(wt!.branch).toBe('main');
    expect(wt!.branch).not.toContain('refs/heads/');
  });

  it('assigns unique ids to each worktree', () => {
    const output = fixture('worktree-list-multiple.txt');
    const worktrees = parseWorktreeOutput(output);
    const ids = worktrees.map((wt) => wt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles detached HEAD — uses short commit hash as branch name', () => {
    const output = fixture('worktree-list-detached.txt');
    const worktrees = parseWorktreeOutput(output);
    expect(worktrees).toHaveLength(2);
    const detached = worktrees[1]!;
    // No branch line → falls back to HEAD hash (8 chars)
    expect(detached.branch).toMatch(/^[0-9a-f]{8}$/);
  });

  it('skips bare worktrees', () => {
    const output = fixture('worktree-list-bare.txt');
    const worktrees = parseWorktreeOutput(output);
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]!.path).toBe('/home/user/project');
  });

  it('returns empty array for empty/blank output', () => {
    expect(parseWorktreeOutput('')).toEqual([]);
    expect(parseWorktreeOutput('   \n\n  ')).toEqual([]);
  });

  it('does not crash on malformed output', () => {
    const malformed = 'not-a-real-field value\nrandom garbage\n\nworktree /valid/path\n';
    expect(() => parseWorktreeOutput(malformed)).not.toThrow();
  });

  it('initialises files as an empty array', () => {
    const output = fixture('worktree-list-single.txt');
    const [wt] = parseWorktreeOutput(output);
    expect(wt!.files).toEqual([]);
  });

  it('initialises diffMode and defaultBranch with defaults', () => {
    const output = fixture('worktree-list-single.txt');
    const [wt] = parseWorktreeOutput(output);
    expect(wt!.diffMode).toEqual({ type: 'working' });
    expect(wt!.defaultBranch).toBe('main');
  });
});

// getDefaultBranch
describe('getDefaultBranch', () => {
  it('returns a string (integration — requires git)', async () => {
    // This test runs against the actual repo. It should return a valid branch name.
    const branch = await getDefaultBranch(process.cwd());
    expect(typeof branch).toBe('string');
    expect(branch.length).toBeGreaterThan(0);
  });

  it('returns "main" as fallback for non-existent directory', async () => {
    const branch = await getDefaultBranch('/tmp/nonexistent-repo-' + Date.now());
    expect(branch).toBe('main');
  });
});

// getGitRoot
describe('getGitRoot', () => {
  it('returns the repo root from a directory inside a git repo', async () => {
    const root = await getGitRoot(process.cwd());
    expect(typeof root).toBe('string');
    expect(root!.length).toBeGreaterThan(0);
  });

  it('returns null for a directory outside any git repo', async () => {
    const root = await getGitRoot('/tmp/nonexistent-dir-' + Date.now());
    expect(root).toBeNull();
  });
});

// listBranches
describe('listBranches', () => {
  it('returns an array of branch name strings', async () => {
    const branches = await listBranches(process.cwd());
    expect(Array.isArray(branches)).toBe(true);
    for (const b of branches) {
      expect(typeof b).toBe('string');
      expect(b.length).toBeGreaterThan(0);
    }
  });

  it('returns empty array for a non-existent repo', async () => {
    const branches = await listBranches('/tmp/nonexistent-repo-' + Date.now());
    expect(branches).toEqual([]);
  });
});

// readWorktreeBadge
describe('readWorktreeBadge', () => {
  function makeTempWorktree(content?: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'shiftspace-badge-test-'));
    if (content !== undefined) {
      writeFileSync(join(dir, WORKTREE_CONFIG_FILENAME), content, 'utf8');
    }
    return dir;
  }

  it('returns undefined when the config file is missing', async () => {
    const dir = makeTempWorktree();
    try {
      expect(await readWorktreeBadge(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a well-formed badge', async () => {
    const dir = makeTempWorktree(
      JSON.stringify({
        badge: { icon: 'clock', label: 'stale', bgColor: '#7f1d1d', fgColor: '#fecaca' },
      })
    );
    try {
      expect(await readWorktreeBadge(dir)).toEqual({
        icon: 'clock',
        label: 'stale',
        bgColor: '#7f1d1d',
        fgColor: '#fecaca',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts 3-, 6-, and 8-digit hex colors', async () => {
    const dir = makeTempWorktree(
      JSON.stringify({
        badge: { icon: 'eye', label: 'x', bgColor: '#abc', fgColor: '#aabbccdd' },
      })
    );
    try {
      const badge = await readWorktreeBadge(dir);
      expect(badge?.bgColor).toBe('#abc');
      expect(badge?.fgColor).toBe('#aabbccdd');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined for non-hex colors (e.g. named or rgb())', async () => {
    const dir = makeTempWorktree(
      JSON.stringify({
        badge: { icon: 'eye', label: 'x', bgColor: 'red', fgColor: '#fff' },
      })
    );
    try {
      expect(await readWorktreeBadge(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined when required fields are missing', async () => {
    const dir = makeTempWorktree(
      JSON.stringify({ badge: { icon: 'eye', label: 'x', bgColor: '#fff' } })
    );
    try {
      expect(await readWorktreeBadge(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined when `badge` key is absent', async () => {
    const dir = makeTempWorktree(JSON.stringify({ somethingElse: true }));
    try {
      expect(await readWorktreeBadge(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined for invalid JSON without throwing', async () => {
    const dir = makeTempWorktree('{ this is not json');
    try {
      expect(await readWorktreeBadge(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined for non-object top level', async () => {
    const dir = makeTempWorktree('42');
    try {
      expect(await readWorktreeBadge(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined when field types are wrong', async () => {
    const dir = makeTempWorktree(
      JSON.stringify({
        badge: { icon: 42, label: 'x', bgColor: '#fff', fgColor: '#000' },
      })
    );
    try {
      expect(await readWorktreeBadge(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// badgesEqual
describe('badgesEqual', () => {
  const a = { icon: 'clock', label: 'stale', bgColor: '#111', fgColor: '#fff' };

  it('returns true for two undefined badges', () => {
    expect(badgesEqual(undefined, undefined)).toBe(true);
  });

  it('returns false when only one side is defined', () => {
    expect(badgesEqual(a, undefined)).toBe(false);
    expect(badgesEqual(undefined, a)).toBe(false);
  });

  it('returns true for structurally equal badges', () => {
    expect(badgesEqual(a, { ...a })).toBe(true);
  });

  it('returns false when any field differs', () => {
    expect(badgesEqual(a, { ...a, icon: 'eye' })).toBe(false);
    expect(badgesEqual(a, { ...a, label: 'stale!' })).toBe(false);
    expect(badgesEqual(a, { ...a, bgColor: '#222' })).toBe(false);
    expect(badgesEqual(a, { ...a, fgColor: '#eee' })).toBe(false);
  });
});
