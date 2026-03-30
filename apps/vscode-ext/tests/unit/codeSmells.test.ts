import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codeSmellsPlugin } from '../../src/insights/plugins/codeSmells';
import type { FileChange } from '@shiftspace/renderer';
import type { SmellRule } from '../../src/actions/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shiftspace-smells-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function makeFile(relPath: string): FileChange {
  return {
    path: relPath,
    status: 'modified',
    staged: false,
    linesAdded: 1,
    linesRemoved: 0,
    lastChangedAt: Date.now(),
  };
}

function makeRule(overrides: Partial<SmellRule> = {}): SmellRule {
  return {
    id: 'test-rule',
    label: 'Test Rule',
    pattern: 'console\\.log',
    threshold: 1,
    ...overrides,
  };
}

async function analyze(files: FileChange[], rules: SmellRule[], signal?: AbortSignal) {
  return codeSmellsPlugin.analyze(files, tmpDir, tmpDir, { smellRules: rules }, signal);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('codeSmellsPlugin — no rules', () => {
  it('returns score 0 when no smell rules configured', async () => {
    writeFile('src/app.ts', 'const x = 1;');
    const { summary, detail } = await analyze([makeFile('src/app.ts')], []);
    expect(summary.score).toBe(0);
    expect(summary.severity).toBe('none');
    expect(detail.fileInsights).toHaveLength(0);
  });
});

describe('codeSmellsPlugin — threshold matching', () => {
  it('does not flag file below threshold', async () => {
    // useEffect appears 3 times, threshold 5 → not flagged
    writeFile(
      'src/hook.tsx',
      ['useEffect(() => {}, [])', 'useEffect(() => {}, [])', 'useEffect(() => {}, [])'].join('\n')
    );
    const rule = makeRule({ id: 'useEffect', pattern: 'useEffect\\s*\\(', threshold: 5 });
    const { detail } = await analyze([makeFile('src/hook.tsx')], [rule]);
    expect(detail.fileInsights).toHaveLength(0);
  });

  it('flags file at or above threshold', async () => {
    // useEffect appears 6 times, threshold 5 → flagged with count=6
    const lines = Array.from({ length: 6 }, () => 'useEffect(() => {}, [])').join('\n');
    writeFile('src/hook.tsx', lines);
    const rule = makeRule({ id: 'useEffect', pattern: 'useEffect\\s*\\(', threshold: 5 });
    const { detail } = await analyze([makeFile('src/hook.tsx')], [rule]);
    expect(detail.fileInsights).toHaveLength(1);
    expect(detail.fileInsights[0]!.findings).toHaveLength(1);
    expect(detail.fileInsights[0]!.findings[0]!.count).toBe(6);
  });

  it('flags file with eslint-disable (threshold 1)', async () => {
    writeFile('src/util.ts', '// eslint-disable-next-line\nconst x = 1;\n// eslint-disable');
    const rule = makeRule({ id: 'eslint-disable', pattern: 'eslint-disable', threshold: 1 });
    const { detail } = await analyze([makeFile('src/util.ts')], [rule]);
    expect(detail.fileInsights[0]!.findings[0]!.count).toBe(2);
  });

  it('does not flag file with zero matches', async () => {
    writeFile('src/clean.ts', 'export const x = 1;');
    const rule = makeRule();
    const { detail } = await analyze([makeFile('src/clean.ts')], [rule]);
    expect(detail.fileInsights).toHaveLength(0);
  });

  it('does not flag empty file', async () => {
    writeFile('src/empty.ts', '');
    const rule = makeRule();
    const { detail } = await analyze([makeFile('src/empty.ts')], [rule]);
    expect(detail.fileInsights).toHaveLength(0);
  });
});

describe('codeSmellsPlugin — fileTypes filtering', () => {
  it('skips file whose extension is not in fileTypes', async () => {
    writeFile('src/style.css', 'console.log("hi")');
    const rule = makeRule({ fileTypes: ['.ts', '.tsx'] });
    const { detail } = await analyze([makeFile('src/style.css')], [rule]);
    expect(detail.fileInsights).toHaveLength(0);
  });

  it('scans file whose extension is in fileTypes', async () => {
    writeFile('src/comp.tsx', 'console.log("hi")');
    const rule = makeRule({ fileTypes: ['.tsx'] });
    const { detail } = await analyze([makeFile('src/comp.tsx')], [rule]);
    expect(detail.fileInsights).toHaveLength(1);
  });

  it('applies to all files when fileTypes is omitted', async () => {
    writeFile('src/any.rb', 'console.log("hi")');
    const rule = makeRule({ fileTypes: undefined });
    const { detail } = await analyze([makeFile('src/any.rb')], [rule]);
    expect(detail.fileInsights).toHaveLength(1);
  });
});

describe('codeSmellsPlugin — multiple rules', () => {
  it('produces multiple findings for a file that matches multiple rules', async () => {
    writeFile(
      'src/messy.tsx',
      ['// eslint-disable-next-line', 'console.log("debug")', 'useEffect(() => {}, [])'].join('\n')
    );
    const rules: SmellRule[] = [
      makeRule({ id: 'eslint', pattern: 'eslint-disable' }),
      makeRule({ id: 'console', pattern: 'console\\.log' }),
      makeRule({ id: 'useEffect', pattern: 'useEffect\\s*\\(', threshold: 1 }),
    ];
    const { detail } = await analyze([makeFile('src/messy.tsx')], rules);
    expect(detail.fileInsights[0]!.findings).toHaveLength(3);
  });
});

describe('codeSmellsPlugin — regex with special chars', () => {
  it('handles regex with escaped dot (console\\.log)', async () => {
    writeFile('src/a.ts', 'console.log("hi")\nconsole_log("no")\n');
    const rule = makeRule({ pattern: 'console\\.log' });
    const { detail } = await analyze([makeFile('src/a.ts')], rule ? [rule] : []);
    // Only console.log matches, not console_log
    expect(detail.fileInsights[0]!.findings[0]!.count).toBe(1);
  });
});

describe('codeSmellsPlugin — score and severity', () => {
  it('score equals total number of triggered rules across all files', async () => {
    writeFile('src/a.ts', 'console.log("a")\nconsole.log("b")');
    writeFile('src/b.ts', 'console.log("c")');
    const rule = makeRule({ id: 'console', pattern: 'console\\.log' });
    const { summary } = await analyze([makeFile('src/a.ts'), makeFile('src/b.ts')], [rule]);
    // Each file triggers the rule once → score = 2 (two findings, one per file)
    expect(summary.score).toBe(2);
  });

  it('severity is low for score 1-3', async () => {
    writeFile('src/a.ts', 'console.log("x")');
    const rule = makeRule();
    const { summary } = await analyze([makeFile('src/a.ts')], [rule]);
    expect(summary.severity).toBe('low');
  });

  it('severity is medium for score 4-8', async () => {
    // Create 5 files each matching one rule
    for (let i = 0; i < 5; i++) {
      writeFile(`src/f${i}.ts`, 'console.log("x")');
    }
    const rule = makeRule();
    const files = Array.from({ length: 5 }, (_, i) => makeFile(`src/f${i}.ts`));
    const { summary } = await analyze(files, [rule]);
    expect(summary.severity).toBe('medium');
  });

  it('severity is high for score > 8', async () => {
    for (let i = 0; i < 9; i++) {
      writeFile(`src/g${i}.ts`, 'console.log("x")');
    }
    const rule = makeRule();
    const files = Array.from({ length: 9 }, (_, i) => makeFile(`src/g${i}.ts`));
    const { summary } = await analyze(files, [rule]);
    expect(summary.severity).toBe('high');
  });

  it('label uses singular "smell" for score 1', async () => {
    writeFile('src/one.ts', 'console.log("x")');
    const rule = makeRule();
    const { summary } = await analyze([makeFile('src/one.ts')], [rule]);
    expect(summary.label).toBe('1 smell');
  });

  it('label uses plural "smells" for score > 1', async () => {
    writeFile('src/x.ts', 'console.log("a")\nconsole.log("b")');
    const rules: SmellRule[] = [
      makeRule({ id: 'r1', pattern: 'console\\.log' }),
      makeRule({ id: 'r2', pattern: 'console\\.log', threshold: 1 }),
    ];
    const { summary } = await analyze([makeFile('src/x.ts')], rules);
    expect(summary.label).toContain('smells');
  });
});

describe('codeSmellsPlugin — abort signal', () => {
  it('respects aborted signal and stops early', async () => {
    for (let i = 0; i < 10; i++) {
      writeFile(`src/abort${i}.ts`, 'console.log("x")');
    }
    const controller = new AbortController();
    controller.abort();
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`src/abort${i}.ts`));
    const rule = makeRule();
    // Should complete without error (not throw)
    const { detail } = await analyze(files, [rule], controller.signal);
    // Aborted immediately so 0 or few files processed
    expect(detail.fileInsights.length).toBeLessThan(10);
  });
});

describe('codeSmellsPlugin — missing file', () => {
  it('skips files that do not exist on disk', async () => {
    // File exists in FileChange list but not on disk
    const rule = makeRule();
    const { detail } = await analyze([makeFile('src/nonexistent.ts')], [rule]);
    expect(detail.fileInsights).toHaveLength(0);
  });
});

describe('codeSmellsPlugin — insight metadata', () => {
  it('insightId is codeSmells', async () => {
    writeFile('src/m.ts', 'console.log("x")');
    const rule = makeRule();
    const { summary, detail } = await analyze([makeFile('src/m.ts')], [rule]);
    expect(summary.insightId).toBe('codeSmells');
    expect(detail.insightId).toBe('codeSmells');
  });

  it('worktreeId is empty string (filled in by runner)', async () => {
    writeFile('src/m.ts', 'console.log("x")');
    const rule = makeRule();
    const { summary, detail } = await analyze([makeFile('src/m.ts')], [rule]);
    expect(summary.worktreeId).toBe('');
    expect(detail.worktreeId).toBe('');
  });
});
