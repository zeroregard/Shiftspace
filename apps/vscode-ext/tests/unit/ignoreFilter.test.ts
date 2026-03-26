import { describe, it, expect } from 'vitest';
import { filterIgnoredFiles } from '../../src/git/ignoreFilter';
import type { FileChange } from '@shiftspace/renderer';

function makeFile(path: string, overrides: Partial<FileChange> = {}): FileChange {
  return {
    path,
    status: 'modified',
    staged: false,
    linesAdded: 5,
    linesRemoved: 2,
    lastChangedAt: Date.now(),
    ...overrides,
  };
}

describe('filterIgnoredFiles', () => {
  it('returns all files unchanged when patterns is empty', () => {
    const files = [makeFile('package.json'), makeFile('src/app.ts')];
    expect(filterIgnoredFiles(files, [])).toEqual(files);
  });

  it('filters files matching a single extension pattern', () => {
    // *.lock matches yarn.lock and package-lock.json does not end in .lock
    const files = [makeFile('yarn.lock'), makeFile('package.json'), makeFile('bun.lockb')];
    const result = filterIgnoredFiles(files, ['*.lock']);
    expect(result.map((f) => f.path)).toEqual(['package.json', 'bun.lockb']);
  });

  it('filters pnpm-lock.yaml with a matching pattern', () => {
    const files = [makeFile('pnpm-lock.yaml'), makeFile('package.json')];
    const result = filterIgnoredFiles(files, ['pnpm-lock.yaml']);
    expect(result.map((f) => f.path)).toEqual(['package.json']);
  });

  it('filters files matching a deep glob pattern', () => {
    const files = [
      makeFile('src/lang/en_us.json'),
      makeFile('src/lang/zh_cn.json'),
      makeFile('src/config.json'),
    ];
    const result = filterIgnoredFiles(files, ['**/lang/*.json']);
    expect(result.map((f) => f.path)).toEqual(['src/config.json']);
  });

  it('applies OR logic — hides file matching any pattern', () => {
    const files = [makeFile('yarn.lock'), makeFile('src/lang/en_us.json'), makeFile('src/app.ts')];
    const result = filterIgnoredFiles(files, ['*.lock', '**/lang/*.json']);
    expect(result.map((f) => f.path)).toEqual(['src/app.ts']);
  });

  it('matches dot files when pattern starts without dot', () => {
    const files = [makeFile('.env'), makeFile('.env.local'), makeFile('src/app.ts')];
    const result = filterIgnoredFiles(files, ['*.env', '.env.local']);
    // *.env matches .env (dot: true), .env.local matched literally
    expect(result.map((f) => f.path)).toEqual(['src/app.ts']);
  });

  it('does not produce false positives — *.json does not match .tsx files', () => {
    // Use **/*.json to match files with directory prefix; *.tsx should not be matched
    const files = [makeFile('src/components/JsonViewer.tsx'), makeFile('src/data.json')];
    const result = filterIgnoredFiles(files, ['**/*.json']);
    expect(result.map((f) => f.path)).toEqual(['src/components/JsonViewer.tsx']);
  });

  it('returns empty array when all files are filtered', () => {
    const files = [makeFile('pnpm-lock.yaml'), makeFile('package-lock.json')];
    const result = filterIgnoredFiles(files, ['*.yaml', '*.json']);
    expect(result).toEqual([]);
  });

  it('returns all files when no files match the pattern', () => {
    const files = [makeFile('src/app.ts'), makeFile('src/index.ts')];
    const result = filterIgnoredFiles(files, ['*.json']);
    expect(result).toEqual(files);
  });

  it('handles nested path patterns correctly', () => {
    const files = [
      makeFile('src/generated/schema.ts'),
      makeFile('src/app/page.ts'),
      makeFile('generated/types.ts'),
    ];
    const result = filterIgnoredFiles(files, ['**/generated/**']);
    expect(result.map((f) => f.path)).toEqual(['src/app/page.ts']);
  });
});
