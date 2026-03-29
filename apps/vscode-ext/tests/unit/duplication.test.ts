import { describe, it, expect } from 'vitest';
import {
  normalizeSource,
  fnv1a,
  fingerprintBlocks,
  detectDuplication,
} from '../../src/insights/plugins/duplication';

describe('normalizeSource', () => {
  it('strips single-line comments', () => {
    const lines = normalizeSource('const a = 1; // this is a comment\nconst b = 2;');
    expect(lines).toEqual(['const a = 1;', 'const b = 2;']);
  });

  it('strips multi-line comments', () => {
    const lines = normalizeSource('/* header */\nconst a = 1;\n/* block\ncomment */\nconst b = 2;');
    expect(lines).toEqual(['const a = 1;', 'const b = 2;']);
  });

  it('collapses whitespace and lowercases', () => {
    const lines = normalizeSource('  const   A  =  1;  \n    const B = 2;');
    expect(lines).toEqual(['const a = 1;', 'const b = 2;']);
  });

  it('skips empty lines', () => {
    const lines = normalizeSource('a\n\n\nb');
    expect(lines).toEqual(['a', 'b']);
  });
});

describe('fnv1a', () => {
  it('returns a number', () => {
    expect(typeof fnv1a('hello')).toBe('number');
  });

  it('same input produces same hash', () => {
    expect(fnv1a('test')).toBe(fnv1a('test'));
  });

  it('different inputs produce different hashes', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
  });
});

describe('fingerprintBlocks', () => {
  it('generates correct number of blocks', () => {
    const lines = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const blocks = fingerprintBlocks('test.ts', lines, 3);
    // 7 lines, window 3 => 5 blocks
    let totalLocations = 0;
    for (const locs of blocks.values()) {
      totalLocations += locs.length;
    }
    expect(totalLocations).toBe(5);
  });

  it('returns empty map when file has fewer lines than window', () => {
    const blocks = fingerprintBlocks('test.ts', ['a', 'b'], 5);
    expect(blocks.size).toBe(0);
  });

  it('tracks correct line ranges', () => {
    const lines = ['line1', 'line2', 'line3', 'line4'];
    const blocks = fingerprintBlocks('test.ts', lines, 2);
    // Find the first block's location
    const firstEntry = blocks.values().next().value;
    expect(firstEntry).toBeDefined();
    const loc = firstEntry![0]!;
    expect(loc.startLine).toBeGreaterThanOrEqual(1);
    expect(loc.endLine).toBe(loc.startLine + 1);
  });
});

describe('detectDuplication', () => {
  it('detects identical files', () => {
    const content = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';
    const fileContents = new Map([
      ['a.ts', content],
      ['b.ts', content],
    ]);
    const results = detectDuplication(fileContents, 0.5, 5);
    expect(results).toHaveLength(1);
    expect(results[0]!.overallSimilarity).toBeGreaterThanOrEqual(0.9);
  });

  it('returns no matches for completely different files', () => {
    const fileContents = new Map([
      ['a.ts', 'alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\neta\ntheta'],
      ['b.ts', 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight'],
    ]);
    const results = detectDuplication(fileContents, 0.5, 5);
    expect(results).toHaveLength(0);
  });

  it('detects partial duplication', () => {
    const shared = 'shared1\nshared2\nshared3\nshared4\nshared5\nshared6';
    const fileA = shared + '\nunique_a1\nunique_a2\nunique_a3\nunique_a4';
    const fileB = 'unique_b1\nunique_b2\n' + shared + '\nunique_b3\nunique_b4';
    const fileContents = new Map([
      ['a.ts', fileA],
      ['b.ts', fileB],
    ]);
    const results = detectDuplication(fileContents, 0.3, 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.matchedBlocks.length).toBeGreaterThan(0);
  });

  it('normalizes whitespace and comments before comparing', () => {
    const contentA =
      '  const   A = 1;\n  const   B = 2;\n  const C = 3;\n  const D = 4;\n  const E = 5;';
    const contentB =
      'const a = 1; // comment\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;';
    const fileContents = new Map([
      ['a.ts', contentA],
      ['b.ts', contentB],
    ]);
    const results = detectDuplication(fileContents, 0.5, 5);
    expect(results).toHaveLength(1);
    expect(results[0]!.overallSimilarity).toBeGreaterThanOrEqual(0.5);
  });

  it('respects threshold filtering', () => {
    // Create files with low similarity (small overlap)
    const sharedBlock = 'shared1\nshared2\nshared3\nshared4\nshared5';
    const fileA =
      sharedBlock +
      '\nunique1\nunique2\nunique3\nunique4\nunique5\nunique6\nunique7\nunique8\nunique9\nunique10\nunique11\nunique12\nunique13\nunique14\nunique15';
    const fileB =
      'other1\nother2\nother3\nother4\nother5\nother6\nother7\nother8\nother9\nother10\nother11\nother12\nother13\nother14\nother15\n' +
      sharedBlock;
    const fileContents = new Map([
      ['a.ts', fileA],
      ['b.ts', fileB],
    ]);

    // With low threshold, should detect
    const lowResults = detectDuplication(fileContents, 0.1, 5);
    expect(lowResults.length).toBeGreaterThanOrEqual(1);

    // With high threshold, should not detect (similarity is 5/20 = 0.25)
    const highResults = detectDuplication(fileContents, 0.9, 5);
    expect(highResults).toHaveLength(0);
  });

  it('respects minBlockLines setting', () => {
    // 4-line duplicate with minBlockLines=5 should not be detected
    const shared = 'dup1\ndup2\ndup3\ndup4';
    const fileA = shared + '\na1\na2\na3\na4\na5';
    const fileB = 'b1\nb2\nb3\nb4\nb5\n' + shared;
    const fileContents = new Map([
      ['a.ts', fileA],
      ['b.ts', fileB],
    ]);

    const results = detectDuplication(fileContents, 0.1, 5);
    expect(results).toHaveLength(0);

    // With minBlockLines=3, should detect
    const resultsLower = detectDuplication(fileContents, 0.1, 3);
    expect(resultsLower.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty file list', () => {
    const results = detectDuplication(new Map(), 0.5, 5);
    expect(results).toEqual([]);
  });

  it('handles single file (no pairs possible)', () => {
    const fileContents = new Map([['a.ts', 'line1\nline2\nline3\nline4\nline5']]);
    const results = detectDuplication(fileContents, 0.5, 5);
    expect(results).toEqual([]);
  });

  it('returns correct block match line ranges', () => {
    const content = 'a\nb\nc\nd\ne';
    const fileContents = new Map([
      ['x.ts', content],
      ['y.ts', content],
    ]);
    const results = detectDuplication(fileContents, 0.5, 5);
    expect(results).toHaveLength(1);
    const block = results[0]!.matchedBlocks[0]!;
    expect(block.startLineA).toBe(1);
    expect(block.endLineA).toBe(5);
    expect(block.startLineB).toBe(1);
    expect(block.endLineB).toBe(5);
  });

  it('lowercasing detects renamed-but-identical code', () => {
    const contentA =
      'const MyVar = 1;\nconst AnotherVar = 2;\nconst Third = 3;\nconst Fourth = 4;\nconst Fifth = 5;';
    const contentB =
      'const myvar = 1;\nconst anothervar = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;';
    const fileContents = new Map([
      ['a.ts', contentA],
      ['b.ts', contentB],
    ]);
    const results = detectDuplication(fileContents, 0.5, 5);
    expect(results).toHaveLength(1);
  });
});
