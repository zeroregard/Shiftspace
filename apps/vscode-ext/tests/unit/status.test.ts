import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseStatusOutput,
  parseNumstatOutput,
  buildFileChanges,
  parseDiffOutput,
  parseRawDiffSections,
  parseBranchNameStatus,
} from '../../src/git/status';

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf8');

// parseStatusOutput
describe('parseStatusOutput', () => {
  it('parses unstaged modified file ( M)', () => {
    const map = parseStatusOutput(' M src/app/page.tsx\n');
    expect(map.get('src/app/page.tsx')).toMatchObject({ status: 'modified', staged: false });
  });

  it('parses staged modified file (M )', () => {
    const map = parseStatusOutput('M  src/app/layout.tsx\n');
    expect(map.get('src/app/layout.tsx')).toMatchObject({ status: 'modified', staged: true });
  });

  it('parses staged + unstaged modified file (MM)', () => {
    const map = parseStatusOutput('MM src/components/Button.tsx\n');
    expect(map.get('src/components/Button.tsx')).toMatchObject({
      status: 'modified',
      staged: true,
    });
  });

  it('parses staged added file (A )', () => {
    const map = parseStatusOutput('A  src/components/Card.tsx\n');
    expect(map.get('src/components/Card.tsx')).toMatchObject({ status: 'added', staged: true });
  });

  it('parses unstaged deleted file ( D)', () => {
    const map = parseStatusOutput(' D src/hooks/useAuth.ts\n');
    expect(map.get('src/hooks/useAuth.ts')).toMatchObject({ status: 'deleted', staged: false });
  });

  it('parses staged deleted file (D )', () => {
    const map = parseStatusOutput('D  src/hooks/useOld.ts\n');
    expect(map.get('src/hooks/useOld.ts')).toMatchObject({ status: 'deleted', staged: true });
  });

  it('parses untracked file (??)', () => {
    const map = parseStatusOutput('?? src/newfile.ts\n');
    expect(map.get('src/newfile.ts')).toMatchObject({ status: 'added', staged: false });
  });

  it('handles quoted paths (files with spaces)', () => {
    const map = parseStatusOutput('?? "src/file with spaces.ts"\n');
    expect(map.has('src/file with spaces.ts')).toBe(true);
  });

  it('handles rename — uses the new path', () => {
    const map = parseStatusOutput('R  src/old-name.ts -> src/new-name.ts\n');
    expect(map.has('src/new-name.ts')).toBe(true);
    expect(map.has('src/old-name.ts')).toBe(false);
  });

  it('skips ignored files (!!)', () => {
    const map = parseStatusOutput('!! node_modules/some-package/index.js\n');
    expect(map.size).toBe(0);
  });

  it('handles empty output — returns empty map', () => {
    expect(parseStatusOutput('').size).toBe(0);
    expect(parseStatusOutput('\n\n').size).toBe(0);
  });

  it('parses the mixed fixture correctly', () => {
    const map = parseStatusOutput(fixture('status-mixed.txt'));
    // Staged and unstaged should exist
    expect(map.has('src/app/page.tsx')).toBe(true);
    expect(map.has('src/app/layout.tsx')).toBe(true);
    expect(map.has('src/newfile.ts')).toBe(true);
    expect(map.has('src/new-name.ts')).toBe(true);
    // Ignored file should NOT be present
    expect(map.has('node_modules/some-package/index.js')).toBe(false);
  });
});

// parseNumstatOutput
describe('parseNumstatOutput', () => {
  it('parses basic numstat lines', () => {
    const map = parseNumstatOutput('12\t4\tsrc/app/page.tsx\n');
    expect(map.get('src/app/page.tsx')).toEqual({ added: 12, removed: 4 });
  });

  it('treats binary files (dash counts) as 0', () => {
    const map = parseNumstatOutput('-\t-\tassets/logo.png\n');
    expect(map.get('assets/logo.png')).toEqual({ added: 0, removed: 0 });
  });

  it('handles quoted paths (files with spaces)', () => {
    const map = parseNumstatOutput('2\t1\t"src/file with spaces.ts"\n');
    expect(map.has('src/file with spaces.ts')).toBe(true);
    expect(map.get('src/file with spaces.ts')).toEqual({ added: 2, removed: 1 });
  });

  it('handles empty output — returns empty map', () => {
    expect(parseNumstatOutput('').size).toBe(0);
  });

  it('skips malformed lines', () => {
    const map = parseNumstatOutput('not-a-real-line\n12\t4\tsrc/ok.ts\n');
    expect(map.size).toBe(1);
    expect(map.has('src/ok.ts')).toBe(true);
  });

  it('parses the numstat fixture correctly', () => {
    const map = parseNumstatOutput(fixture('numstat-basic.txt'));
    expect(map.get('src/app/page.tsx')).toEqual({ added: 12, removed: 4 });
    expect(map.get('src/components/Card.tsx')).toEqual({ added: 8, removed: 3 });
    // binary
    expect(map.get('assets/logo.png')).toEqual({ added: 0, removed: 0 });
  });
});

// buildFileChanges
describe('buildFileChanges', () => {
  it('combines status + unstaged diff + staged diff', () => {
    const status = ' M src/app/page.tsx\nA  src/new.ts\n';
    const diff = '12\t4\tsrc/app/page.tsx\n';
    const cached = '3\t1\tsrc/new.ts\n';

    const changes = buildFileChanges(status, diff, cached);
    expect(changes).toHaveLength(2);

    const page = changes.find((f) => f.path === 'src/app/page.tsx')!;
    expect(page.linesAdded).toBe(12);
    expect(page.linesRemoved).toBe(4);
    expect(page.staged).toBe(false);
    expect(page.status).toBe('modified');

    const newFile = changes.find((f) => f.path === 'src/new.ts')!;
    expect(newFile.linesAdded).toBe(3);
    expect(newFile.linesRemoved).toBe(1);
    expect(newFile.staged).toBe(true);
    expect(newFile.status).toBe('added');
  });

  it('sums unstaged + staged line counts', () => {
    const status = 'MM src/app/layout.tsx\n';
    const diff = '3\t1\tsrc/app/layout.tsx\n';
    const cached = '5\t2\tsrc/app/layout.tsx\n';

    const [f] = buildFileChanges(status, diff, cached);
    expect(f!.linesAdded).toBe(8); // 3 + 5
    expect(f!.linesRemoved).toBe(3); // 1 + 2
  });

  it('handles files with no diff stats (zero counts)', () => {
    const status = '?? src/newfile.ts\n';
    const [f] = buildFileChanges(status, '', '');
    expect(f!.linesAdded).toBe(0);
    expect(f!.linesRemoved).toBe(0);
  });

  it('returns empty array when status is empty', () => {
    expect(buildFileChanges('', '', '')).toEqual([]);
  });

  it('sets lastChangedAt to a recent timestamp', () => {
    const before = Date.now();
    const [f] = buildFileChanges('?? src/newfile.ts\n', '', '');
    const after = Date.now();
    expect(f!.lastChangedAt).toBeGreaterThanOrEqual(before);
    expect(f!.lastChangedAt).toBeLessThanOrEqual(after);
  });
});

// parseDiffOutput
describe('parseDiffOutput', () => {
  it('returns empty map for empty output', () => {
    expect(parseDiffOutput('').size).toBe(0);
    expect(parseDiffOutput('  \n').size).toBe(0);
  });

  it('parses a modified file with one hunk', () => {
    const diff = fixture('diff-unified.txt');
    const map = parseDiffOutput(diff);
    expect(map.has('src/app/page.tsx')).toBe(true);

    const hunks = map.get('src/app/page.tsx')!;
    expect(hunks.length).toBe(1);
    expect(hunks[0]!.header).toContain('@@');

    const added = hunks[0]!.lines.filter((l) => l.type === 'added');
    const removed = hunks[0]!.lines.filter((l) => l.type === 'removed');
    const context = hunks[0]!.lines.filter((l) => l.type === 'context');
    expect(added.length).toBeGreaterThan(0);
    expect(removed.length).toBeGreaterThan(0);
    expect(context.length).toBeGreaterThan(0);
  });

  it('parses a new file (--- /dev/null → +++ b/path)', () => {
    const diff = fixture('diff-unified.txt');
    const map = parseDiffOutput(diff);
    expect(map.has('src/newfile.ts')).toBe(true);

    const hunks = map.get('src/newfile.ts')!;
    expect(hunks.length).toBe(1);
    // All lines should be additions
    expect(hunks[0]!.lines.every((l) => l.type === 'added')).toBe(true);
    expect(hunks[0]!.lines.length).toBe(3);
  });

  it('skips deleted files (+++ /dev/null)', () => {
    const diff = fixture('diff-unified.txt');
    const map = parseDiffOutput(diff);
    // deleted.ts has +++ /dev/null — should be skipped
    expect(map.has('src/deleted.ts')).toBe(false);
  });

  it('handles quoted paths in diff output', () => {
    const diff = `diff --git "a/src/file with spaces.ts" "b/src/file with spaces.ts"
index abc..def 100644
--- "a/src/file with spaces.ts"
+++ "b/src/file with spaces.ts"
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;
    const map = parseDiffOutput(diff);
    expect(map.has('src/file with spaces.ts')).toBe(true);
  });

  it('skips binary files with no +++ line', () => {
    const diff = `diff --git a/assets/logo.png b/assets/logo.png
Binary files a/assets/logo.png and b/assets/logo.png differ
`;
    const map = parseDiffOutput(diff);
    expect(map.size).toBe(0);
  });
});

// parseRawDiffSections
describe('parseRawDiffSections', () => {
  it('returns empty map for empty output', () => {
    expect(parseRawDiffSections('').size).toBe(0);
    expect(parseRawDiffSections('  \n').size).toBe(0);
  });

  it('extracts per-file raw diff sections for modified files', () => {
    const diff = fixture('diff-unified.txt');
    const map = parseRawDiffSections(diff);
    expect(map.has('src/app/page.tsx')).toBe(true);

    const raw = map.get('src/app/page.tsx')!;
    expect(raw).toContain('--- a/src/app/page.tsx');
    expect(raw).toContain('+++ b/src/app/page.tsx');
    expect(raw).toContain('@@');
    expect(raw).toContain('+import { NewComponent }');
    expect(raw).toContain('-import { OldComponent }');
  });

  it('extracts new file sections', () => {
    const diff = fixture('diff-unified.txt');
    const map = parseRawDiffSections(diff);
    expect(map.has('src/newfile.ts')).toBe(true);

    const raw = map.get('src/newfile.ts')!;
    expect(raw).toContain('--- /dev/null');
    expect(raw).toContain('+++ b/src/newfile.ts');
  });

  it('extracts deleted file sections using the --- path', () => {
    const diff = fixture('diff-unified.txt');
    const map = parseRawDiffSections(diff);
    expect(map.has('src/deleted.ts')).toBe(true);

    const raw = map.get('src/deleted.ts')!;
    expect(raw).toContain('--- a/src/deleted.ts');
    expect(raw).toContain('+++ /dev/null');
  });

  it('handles quoted paths', () => {
    const diff = `diff --git "a/src/file with spaces.ts" "b/src/file with spaces.ts"
index abc..def 100644
--- "a/src/file with spaces.ts"
+++ "b/src/file with spaces.ts"
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;
    const map = parseRawDiffSections(diff);
    expect(map.has('src/file with spaces.ts')).toBe(true);
  });

  it('skips binary files with no +++ line', () => {
    const diff = `diff --git a/assets/logo.png b/assets/logo.png
Binary files a/assets/logo.png and b/assets/logo.png differ
`;
    const map = parseRawDiffSections(diff);
    expect(map.size).toBe(0);
  });
});

// parseBranchNameStatus
describe('parseBranchNameStatus', () => {
  it('parses added files', () => {
    const map = parseBranchNameStatus('A\tsrc/new-feature.ts\n');
    expect(map.get('src/new-feature.ts')).toBe('added');
  });

  it('parses modified files', () => {
    const map = parseBranchNameStatus('M\tsrc/existing.ts\n');
    expect(map.get('src/existing.ts')).toBe('modified');
  });

  it('parses deleted files', () => {
    const map = parseBranchNameStatus('D\tsrc/old.ts\n');
    expect(map.get('src/old.ts')).toBe('deleted');
  });

  it('parses renames — uses the new path', () => {
    const map = parseBranchNameStatus('R100\tsrc/old-name.ts\tsrc/new-name.ts\n');
    expect(map.has('src/new-name.ts')).toBe(true);
    expect(map.get('src/new-name.ts')).toBe('modified');
  });

  it('handles quoted paths', () => {
    const map = parseBranchNameStatus('M\t"src/file with spaces.ts"\n');
    expect(map.has('src/file with spaces.ts')).toBe(true);
  });

  it('handles multiple files', () => {
    const output = 'A\tsrc/new.ts\nM\tsrc/mod.ts\nD\tsrc/del.ts\n';
    const map = parseBranchNameStatus(output);
    expect(map.size).toBe(3);
    expect(map.get('src/new.ts')).toBe('added');
    expect(map.get('src/mod.ts')).toBe('modified');
    expect(map.get('src/del.ts')).toBe('deleted');
  });

  it('returns empty map for empty output', () => {
    expect(parseBranchNameStatus('').size).toBe(0);
    expect(parseBranchNameStatus('\n\n').size).toBe(0);
  });

  it('skips malformed lines', () => {
    const map = parseBranchNameStatus('not-valid\nM\tsrc/ok.ts\n');
    expect(map.size).toBe(1);
    expect(map.has('src/ok.ts')).toBe(true);
  });
});
