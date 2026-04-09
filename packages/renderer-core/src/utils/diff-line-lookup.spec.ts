import { describe, it, expect } from 'vitest';
import { getSourceLineFromHunks } from './diff-line-lookup';
import type { DiffHunk } from '../types';

const SINGLE_HUNK: DiffHunk[] = [
  {
    header: '@@ -1,3 +1,4 @@',
    lines: [
      { type: 'context', content: 'const a = 1;' }, // new L1
      { type: 'removed', content: 'const b = 2;' }, // not in new file
      { type: 'added', content: 'const b = 3;' }, // new L2
      { type: 'added', content: 'const c = 4;' }, // new L3
      { type: 'context', content: 'export { a };' }, // new L4
    ],
  },
];

const MULTI_HUNK: DiffHunk[] = [
  {
    header: '@@ -1,3 +1,3 @@',
    lines: [
      { type: 'context', content: 'line one' }, // new L1
      { type: 'removed', content: 'old two' },
      { type: 'added', content: 'new two' }, // new L2
      { type: 'context', content: 'line three' }, // new L3
    ],
  },
  {
    header: '@@ -20,3 +20,4 @@',
    lines: [
      { type: 'context', content: 'line twenty' }, // new L20
      { type: 'added', content: 'inserted' }, // new L21
      { type: 'context', content: 'line twenty-one' }, // new L22
      { type: 'context', content: 'line twenty-two' }, // new L23
    ],
  },
];

describe('getSourceLineFromHunks', () => {
  it('returns undefined for undefined hunks', () => {
    expect(getSourceLineFromHunks(undefined, 1)).toBeUndefined();
  });

  it('returns undefined for empty hunks', () => {
    expect(getSourceLineFromHunks([], 1)).toBeUndefined();
  });

  it('returns undefined for invalid line number', () => {
    expect(getSourceLineFromHunks(SINGLE_HUNK, 0)).toBeUndefined();
    expect(getSourceLineFromHunks(SINGLE_HUNK, -1)).toBeUndefined();
  });

  it('finds a context line', () => {
    expect(getSourceLineFromHunks(SINGLE_HUNK, 1)).toBe('const a = 1;');
  });

  it('finds an added line (skips removed)', () => {
    expect(getSourceLineFromHunks(SINGLE_HUNK, 2)).toBe('const b = 3;');
    expect(getSourceLineFromHunks(SINGLE_HUNK, 3)).toBe('const c = 4;');
  });

  it('finds the trailing context line', () => {
    expect(getSourceLineFromHunks(SINGLE_HUNK, 4)).toBe('export { a };');
  });

  it('returns undefined for a line outside the hunk range', () => {
    expect(getSourceLineFromHunks(SINGLE_HUNK, 5)).toBeUndefined();
    expect(getSourceLineFromHunks(SINGLE_HUNK, 100)).toBeUndefined();
  });

  it('finds lines across multiple hunks', () => {
    expect(getSourceLineFromHunks(MULTI_HUNK, 1)).toBe('line one');
    expect(getSourceLineFromHunks(MULTI_HUNK, 2)).toBe('new two');
    expect(getSourceLineFromHunks(MULTI_HUNK, 20)).toBe('line twenty');
    expect(getSourceLineFromHunks(MULTI_HUNK, 21)).toBe('inserted');
    expect(getSourceLineFromHunks(MULTI_HUNK, 22)).toBe('line twenty-one');
  });

  it('returns undefined for a line between hunks (gap)', () => {
    expect(getSourceLineFromHunks(MULTI_HUNK, 10)).toBeUndefined();
  });

  it('handles hunk header without count (+N instead of +N,M)', () => {
    const hunks: DiffHunk[] = [
      {
        header: '@@ -5 +5 @@',
        lines: [{ type: 'added', content: 'single line' }],
      },
    ];
    expect(getSourceLineFromHunks(hunks, 5)).toBe('single line');
  });
});
