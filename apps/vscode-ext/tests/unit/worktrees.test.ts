import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseWorktreeOutput,
  getDefaultBranch,
  getGitRoot,
  listBranches,
  readWorktreeConfig,
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

// readWorktreeConfig
describe('readWorktreeConfig', () => {
  function makeTempWorktree(content?: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'shiftspace-config-test-'));
    if (content !== undefined) {
      writeFileSync(join(dir, WORKTREE_CONFIG_FILENAME), content, 'utf8');
    }
    return dir;
  }

  it('returns empty config when the config file is missing', async () => {
    const dir = makeTempWorktree();
    try {
      expect(await readWorktreeConfig(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a well-formed badge with a color', async () => {
    const dir = makeTempWorktree(JSON.stringify({ badge: { label: 'stale', color: 'warning' } }));
    try {
      expect((await readWorktreeConfig(dir)).badge).toEqual({ label: 'stale', color: 'warning' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a badge without a color (defaults to neutral at render time)', async () => {
    const dir = makeTempWorktree(JSON.stringify({ badge: { label: 'stale' } }));
    try {
      expect((await readWorktreeConfig(dir)).badge).toEqual({ label: 'stale' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a badge with a description', async () => {
    const dir = makeTempWorktree(
      JSON.stringify({ badge: { label: 'stale', description: 'Needs rebase.' } })
    );
    try {
      expect((await readWorktreeConfig(dir)).badge).toEqual({
        label: 'stale',
        description: 'Needs rebase.',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops a non-string description but keeps the badge', async () => {
    const dir = makeTempWorktree(JSON.stringify({ badge: { label: 'stale', description: 42 } }));
    try {
      expect((await readWorktreeConfig(dir)).badge).toEqual({ label: 'stale' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops an empty string description', async () => {
    const dir = makeTempWorktree(JSON.stringify({ badge: { label: 'stale', description: '' } }));
    try {
      expect((await readWorktreeConfig(dir)).badge).toEqual({ label: 'stale' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops badge with unknown color value', async () => {
    const dir = makeTempWorktree(JSON.stringify({ badge: { label: 'x', color: '#ff0000' } }));
    try {
      expect((await readWorktreeConfig(dir)).badge).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops badge when label is missing', async () => {
    const dir = makeTempWorktree(JSON.stringify({ badge: { color: 'info' } }));
    try {
      expect((await readWorktreeConfig(dir)).badge).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty config when neither `badge` nor `planPath` is present', async () => {
    const dir = makeTempWorktree(JSON.stringify({ somethingElse: true }));
    try {
      expect(await readWorktreeConfig(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty config for invalid JSON without throwing', async () => {
    const dir = makeTempWorktree('{ this is not json');
    try {
      expect(await readWorktreeConfig(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty config for non-object top level', async () => {
    const dir = makeTempWorktree('42');
    try {
      expect(await readWorktreeConfig(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a relative planPath', async () => {
    const dir = makeTempWorktree(JSON.stringify({ planPath: 'docs/PLAN.md' }));
    try {
      expect((await readWorktreeConfig(dir)).planPath).toBe('docs/PLAN.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an absolute planPath', async () => {
    const dir = makeTempWorktree(JSON.stringify({ planPath: '/etc/passwd' }));
    try {
      expect((await readWorktreeConfig(dir)).planPath).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an empty planPath', async () => {
    const dir = makeTempWorktree(JSON.stringify({ planPath: '' }));
    try {
      expect((await readWorktreeConfig(dir)).planPath).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a non-string planPath but keeps the badge', async () => {
    const dir = makeTempWorktree(JSON.stringify({ planPath: 42, badge: { label: 'stale' } }));
    try {
      const cfg = await readWorktreeConfig(dir);
      expect(cfg.planPath).toBeUndefined();
      expect(cfg.badge).toEqual({ label: 'stale' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// badgesEqual
describe('badgesEqual', () => {
  const a = { label: 'stale', color: 'warning' as const };

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
    expect(badgesEqual(a, { ...a, label: 'stale!' })).toBe(false);
    expect(badgesEqual(a, { ...a, color: 'info' })).toBe(false);
    expect(badgesEqual(a, { ...a, description: 'new' })).toBe(false);
  });
});
