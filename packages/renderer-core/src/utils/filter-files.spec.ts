import { describe, it, expect } from 'vitest';
import {
  matchesFileFilter,
  isValidRegex,
  filterFilesByQuery,
  getAllFilteredFiles,
  partitionFiles,
} from './list-sections';
import type { WorktreeState, FileChange } from '../types';

// Helpers

function makeFile(
  path: string,
  staged: boolean,
  status: FileChange['status'] = 'modified'
): FileChange {
  return { path, status, staged, linesAdded: 1, linesRemoved: 0, lastChangedAt: 0 };
}

function makeWt(overrides: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-test',
    path: '/tmp/repo',
    branch: 'feature/x',
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
    lastActivityAt: 0,
    ...overrides,
  };
}

// matchesFileFilter

describe('matchesFileFilter', () => {
  it('returns true for empty query', () => {
    expect(matchesFileFilter('src/utils/auth.ts', '')).toBe(true);
  });

  it('matches plain substring (case-insensitive)', () => {
    expect(matchesFileFilter('src/utils/auth.ts', 'auth')).toBe(true);
    expect(matchesFileFilter('src/utils/auth.ts', 'AUTH')).toBe(true);
    expect(matchesFileFilter('src/utils/auth.ts', 'utils')).toBe(true);
  });

  it('does not match when substring is absent', () => {
    expect(matchesFileFilter('src/utils/auth.ts', 'hooks')).toBe(false);
  });

  it('uses regex when query is valid regex', () => {
    expect(matchesFileFilter('src/hooks/useAuth.ts', 'hooks?/use')).toBe(true);
    expect(matchesFileFilter('src/hook/useAuth.ts', 'hooks?/use')).toBe(true);
    expect(matchesFileFilter('src/utils/auth.ts', 'hooks?/use')).toBe(false);
  });

  it('matches with regex character classes', () => {
    expect(matchesFileFilter('src/components/Button.tsx', '\\.(tsx|ts)$')).toBe(true);
    expect(matchesFileFilter('src/styles/main.css', '\\.(tsx|ts)$')).toBe(false);
  });

  it('falls back to substring for invalid regex', () => {
    // "[invalid" is not a valid regex — unmatched bracket
    expect(matchesFileFilter('file-[invalid]-test.ts', '[invalid')).toBe(true);
    expect(matchesFileFilter('other-file.ts', '[invalid')).toBe(false);
  });

  it('handles regex with special characters gracefully', () => {
    // Unbalanced parens — invalid regex, falls back to substring
    expect(matchesFileFilter('some(thing.ts', '(thing')).toBe(true);
    expect(matchesFileFilter('other.ts', '(thing')).toBe(false);
  });

  it('handles dot in query (matches as regex dot)', () => {
    // "." in regex matches any character
    expect(matchesFileFilter('src/a.ts', 'a.ts')).toBe(true);
    // Also matches "axts" since "." matches any char in regex
    expect(matchesFileFilter('src/axts', 'a.ts')).toBe(true);
  });

  it('handles partial regex being typed character by character', () => {
    // Simulate typing "hooks?/use" one character at a time
    const path = 'src/hooks/useAuth.ts';
    expect(matchesFileFilter(path, 'h')).toBe(true);
    expect(matchesFileFilter(path, 'ho')).toBe(true);
    expect(matchesFileFilter(path, 'hoo')).toBe(true);
    expect(matchesFileFilter(path, 'hook')).toBe(true);
    expect(matchesFileFilter(path, 'hooks')).toBe(true);
    expect(matchesFileFilter(path, 'hooks?')).toBe(true); // valid regex
    expect(matchesFileFilter(path, 'hooks?/')).toBe(true); // valid regex
    expect(matchesFileFilter(path, 'hooks?/u')).toBe(true); // valid regex
    expect(matchesFileFilter(path, 'hooks?/us')).toBe(true);
    expect(matchesFileFilter(path, 'hooks?/use')).toBe(true);
  });

  it('does not crash on any single-character input', () => {
    const dangerous = ['[', ']', '(', ')', '{', '}', '\\', '*', '+', '?', '^', '$', '|', '.'];
    for (const ch of dangerous) {
      // Should not throw — just return a boolean
      expect(() => matchesFileFilter('test.ts', ch)).not.toThrow();
    }
  });
});

// isValidRegex

describe('isValidRegex', () => {
  it('returns true for empty string', () => {
    expect(isValidRegex('')).toBe(true);
  });

  it('returns true for valid regex patterns', () => {
    expect(isValidRegex('hooks?/use')).toBe(true);
    expect(isValidRegex('\\.(tsx|ts)$')).toBe(true);
    expect(isValidRegex('src/.*')).toBe(true);
    expect(isValidRegex('simple')).toBe(true);
  });

  it('returns false for invalid regex patterns', () => {
    expect(isValidRegex('[invalid')).toBe(false);
    expect(isValidRegex('(unclosed')).toBe(false);
    expect(isValidRegex('*quantifier')).toBe(false);
  });
});

// filterFilesByQuery

describe('filterFilesByQuery', () => {
  const files: FileChange[] = [
    makeFile('src/hooks/useAuth.ts', false),
    makeFile('src/hooks/useTheme.ts', false),
    makeFile('src/components/Header.tsx', true),
    makeFile('src/components/Footer.tsx', true),
    makeFile('package.json', false),
    makeFile('tsconfig.json', false),
  ];

  it('returns all files for empty query', () => {
    expect(filterFilesByQuery(files, '')).toEqual(files);
  });

  it('filters by plain substring', () => {
    const result = filterFilesByQuery(files, 'hook');
    expect(result.map((f) => f.path)).toEqual(['src/hooks/useAuth.ts', 'src/hooks/useTheme.ts']);
  });

  it('filters by regex', () => {
    const result = filterFilesByQuery(files, '\\.tsx$');
    expect(result.map((f) => f.path)).toEqual([
      'src/components/Header.tsx',
      'src/components/Footer.tsx',
    ]);
  });

  it('is case-insensitive', () => {
    const result = filterFilesByQuery(files, 'HEADER');
    expect(result.map((f) => f.path)).toEqual(['src/components/Header.tsx']);
  });

  it('falls back to substring for invalid regex', () => {
    const result = filterFilesByQuery(files, '[json');
    // Substring "[json" doesn't appear in any path
    expect(result).toEqual([]);
  });

  it('returns empty array when no matches', () => {
    expect(filterFilesByQuery(files, 'nonexistent')).toEqual([]);
  });

  it('matches against full file path, not just filename', () => {
    const result = filterFilesByQuery(files, 'components');
    expect(result.map((f) => f.path)).toEqual([
      'src/components/Header.tsx',
      'src/components/Footer.tsx',
    ]);
  });

  it('handles rapid filter changes without errors', () => {
    // Simulate typing "src/h" quickly
    const queries = ['s', 'sr', 'src', 'src/', 'src/h'];
    for (const q of queries) {
      expect(() => filterFilesByQuery(files, q)).not.toThrow();
    }
  });
});

// getAllFilteredFiles

describe('getAllFilteredFiles', () => {
  it('combines committed + staged + unstaged in working mode and filters', () => {
    const wt = makeWt({
      files: [makeFile('src/auth.ts', true), makeFile('src/db.ts', false)],
    });
    const result = getAllFilteredFiles(wt, 'auth');
    expect(result.map((f) => f.path)).toEqual(['src/auth.ts']);
  });

  it('includes branchFiles in branch diff mode', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('src/committed.ts', false)],
      files: [makeFile('src/staged.ts', true), makeFile('src/unstaged.ts', false)],
    });
    const all = getAllFilteredFiles(wt, '');
    expect(all.map((f) => f.path)).toEqual([
      'src/committed.ts',
      'src/staged.ts',
      'src/unstaged.ts',
    ]);
  });

  it('filters branchFiles too when query is set', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('src/committed.ts', false), makeFile('lib/other.ts', false)],
      files: [makeFile('src/staged.ts', true)],
    });
    const result = getAllFilteredFiles(wt, 'src/');
    expect(result.map((f) => f.path)).toEqual(['src/committed.ts', 'src/staged.ts']);
  });

  it('returns empty array for empty worktree', () => {
    const wt = makeWt({ files: [] });
    expect(getAllFilteredFiles(wt, '')).toEqual([]);
  });

  it('returns empty array when query matches nothing', () => {
    const wt = makeWt({
      files: [makeFile('a.ts', false), makeFile('b.ts', false)],
    });
    expect(getAllFilteredFiles(wt, 'nonexistent')).toEqual([]);
  });

  it('returns all files when query is empty in branch mode', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('committed.ts', false)],
      files: [makeFile('staged.ts', true), makeFile('unstaged.ts', false)],
    });
    const all = getAllFilteredFiles(wt, '');
    expect(all).toHaveLength(3);
  });

  it('does not duplicate partially-staged files', () => {
    const partialFile: FileChange = {
      path: 'src/App.tsx',
      status: 'modified',
      staged: true,
      partiallyStaged: true,
      linesAdded: 5,
      linesRemoved: 2,
      lastChangedAt: 0,
    };
    const wt = makeWt({ files: [partialFile] });
    const result = getAllFilteredFiles(wt, '');
    // partiallyStaged file should appear exactly once, not twice
    expect(result.filter((f) => f.path === 'src/App.tsx')).toHaveLength(1);
  });

  it('does not duplicate partially-staged files when filtering', () => {
    const partialFile: FileChange = {
      path: 'src/App.tsx',
      status: 'modified',
      staged: true,
      partiallyStaged: true,
      linesAdded: 5,
      linesRemoved: 2,
      lastChangedAt: 0,
    };
    const otherFile = makeFile('lib/utils.ts', false);
    const wt = makeWt({ files: [partialFile, otherFile] });
    const result = getAllFilteredFiles(wt, 'App');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/App.tsx');
  });

  it('deduplicates multiple partially-staged files correctly', () => {
    const files: FileChange[] = [
      {
        path: 'src/A.tsx',
        status: 'modified',
        staged: true,
        partiallyStaged: true,
        linesAdded: 1,
        linesRemoved: 0,
        lastChangedAt: 0,
      },
      {
        path: 'src/B.tsx',
        status: 'modified',
        staged: true,
        partiallyStaged: true,
        linesAdded: 1,
        linesRemoved: 0,
        lastChangedAt: 0,
      },
      makeFile('src/C.tsx', true),
      makeFile('src/D.tsx', false),
    ];
    const wt = makeWt({ files });
    const result = getAllFilteredFiles(wt, '');
    const paths = result.map((f) => f.path);
    // Each file should appear exactly once
    expect(paths.sort()).toEqual(['src/A.tsx', 'src/B.tsx', 'src/C.tsx', 'src/D.tsx']);
  });
});

// Integration: partitionFiles + filterFilesByQuery consistency

describe('partitionFiles + filterFilesByQuery consistency', () => {
  it('filtering each section produces the same unique paths as getAllFilteredFiles', () => {
    const wt = makeWt({
      diffMode: { type: 'branch', branch: 'main' },
      branchFiles: [makeFile('src/committed1.ts', false), makeFile('lib/committed2.ts', false)],
      files: [makeFile('src/staged.ts', true), makeFile('lib/unstaged.ts', false)],
    });
    const query = 'src/';

    const { committed, staged, unstaged } = partitionFiles(wt);
    const filteredSections = [
      ...filterFilesByQuery(committed, query),
      ...filterFilesByQuery(staged, query),
      ...filterFilesByQuery(unstaged, query),
    ];

    const filteredAll = getAllFilteredFiles(wt, query);

    // getAllFilteredFiles deduplicates, so compare unique paths
    const uniqueSectionPaths = [...new Set(filteredSections.map((f) => f.path))].sort();
    expect(uniqueSectionPaths).toEqual(filteredAll.map((f) => f.path).sort());
  });

  it('partially-staged files appear once in getAllFilteredFiles despite being in two sections', () => {
    const partialFile: FileChange = {
      path: 'src/shared.ts',
      status: 'modified',
      staged: true,
      partiallyStaged: true,
      linesAdded: 3,
      linesRemoved: 1,
      lastChangedAt: 0,
    };
    const wt = makeWt({ files: [partialFile] });

    const { staged, unstaged } = partitionFiles(wt);
    // partitionFiles intentionally puts it in both sections
    expect(staged.filter((f) => f.path === 'src/shared.ts')).toHaveLength(1);
    expect(unstaged.filter((f) => f.path === 'src/shared.ts')).toHaveLength(1);

    // But getAllFilteredFiles deduplicates for the tree view
    const all = getAllFilteredFiles(wt, '');
    expect(all.filter((f) => f.path === 'src/shared.ts')).toHaveLength(1);
  });
});
