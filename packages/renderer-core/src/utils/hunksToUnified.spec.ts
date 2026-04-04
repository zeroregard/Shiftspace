import { describe, it, expect } from 'vitest';
import type { DiffHunk } from '../types';
import { hunksToUnified } from './hunksToUnified';

const HUNK: DiffHunk = {
  header: '@@ -1,3 +1,4 @@',
  lines: [
    { type: 'context', content: 'const a = 1;' },
    { type: 'removed', content: 'const b = 2;' },
    { type: 'added', content: 'const b = 3;' },
    { type: 'context', content: 'export { a, b };' },
  ],
};

describe('hunksToUnified', () => {
  it('produces exactly one diff --git header (required by @pierre/diffs PatchDiff)', () => {
    const patch = hunksToUnified('src/foo.ts', [HUNK], 'modified');
    const gitHeaders = patch.split('\n').filter((l) => l.startsWith('diff --git'));
    expect(gitHeaders).toHaveLength(1);
  });

  it('uses /dev/null as old path for added files', () => {
    const patch = hunksToUnified('src/new.ts', [HUNK], 'added');
    expect(patch).toContain('--- /dev/null');
    expect(patch).toContain('+++ b/src/new.ts');
  });

  it('uses /dev/null as new path for deleted files', () => {
    const patch = hunksToUnified('src/old.ts', [HUNK], 'deleted');
    expect(patch).toContain('--- a/src/old.ts');
    expect(patch).toContain('+++ /dev/null');
  });

  it('prefixes added/removed/context lines correctly', () => {
    const patch = hunksToUnified('src/foo.ts', [HUNK], 'modified');
    expect(patch).toContain(' const a = 1;');
    expect(patch).toContain('-const b = 2;');
    expect(patch).toContain('+const b = 3;');
  });

  it('includes the hunk header', () => {
    const patch = hunksToUnified('src/foo.ts', [HUNK], 'modified');
    expect(patch).toContain('@@ -1,3 +1,4 @@');
  });
});
