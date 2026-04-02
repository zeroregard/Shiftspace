import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectDiagnostics } from '../../src/insights/plugins/diagnostics';
import type { FileChange } from '@shiftspace/renderer';

// The vscode mock is resolved via vitest.config.ts alias.
// We need to set up getDiagnostics for these tests.
import * as vscode from 'vscode';

function makeFile(path: string): FileChange {
  return {
    path,
    status: 'modified',
    staged: false,
    linesAdded: 1,
    linesRemoved: 0,
    lastChangedAt: Date.now(),
  };
}

describe('collectDiagnostics', () => {
  beforeEach(() => {
    // Reset the mock before each test
    (vscode.languages as Record<string, unknown>).getDiagnostics = vi.fn(() => []);
  });

  it('includes files with zero diagnostics in the results', () => {
    const getDiag = vi.fn((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('a.ts')) {
        return [
          {
            severity: 0, // Error
            message: 'err',
            source: 'ts',
            range: { start: { line: 0 }, end: { line: 0 } },
          },
        ];
      }
      return []; // b.ts has no diagnostics
    });
    (vscode.languages as Record<string, unknown>).getDiagnostics = getDiag;

    const results = collectDiagnostics([makeFile('a.ts'), makeFile('b.ts')], '/repo');

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.filePath === 'a.ts')?.errors).toBe(1);

    const bResult = results.find((r) => r.filePath === 'b.ts');
    expect(bResult).toBeDefined();
    expect(bResult!.errors).toBe(0);
    expect(bResult!.warnings).toBe(0);
  });

  it('caps details at MAX_DETAILS_PER_FILE (50)', () => {
    const manyDiags = Array.from({ length: 60 }, (_, i) => ({
      severity: 1, // Warning
      message: `warn ${i}`,
      source: 'eslint',
      range: { start: { line: i }, end: { line: i } },
    }));
    (vscode.languages as Record<string, unknown>).getDiagnostics = vi.fn(() => manyDiags);

    const results = collectDiagnostics([makeFile('big.ts')], '/repo');

    expect(results[0].warnings).toBe(60); // count is not capped
    expect(results[0].details).toHaveLength(50); // details are capped
  });

  it('correctly categorises all severity levels', () => {
    const diags = [
      { severity: 0, message: 'e', source: 'ts', range: { start: { line: 0 }, end: { line: 0 } } },
      { severity: 1, message: 'w', source: 'ts', range: { start: { line: 1 }, end: { line: 1 } } },
      { severity: 2, message: 'i', source: 'ts', range: { start: { line: 2 }, end: { line: 2 } } },
      { severity: 3, message: 'h', source: 'ts', range: { start: { line: 3 }, end: { line: 3 } } },
    ];
    (vscode.languages as Record<string, unknown>).getDiagnostics = vi.fn(() => diags);

    const [result] = collectDiagnostics([makeFile('f.ts')], '/repo');

    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.info).toBe(1);
    expect(result.hints).toBe(1);
  });
});

describe('DiagnosticCollector.updateFiles', () => {
  // We import the class lazily to ensure the vscode mock is set up first
  let DiagnosticCollector: typeof import('../../src/insights/plugins/diagnostics').DiagnosticCollector;

  beforeEach(async () => {
    // Set up minimal language mocks
    (vscode.languages as Record<string, unknown>).getDiagnostics = vi.fn(() => []);
    (vscode.languages as Record<string, unknown>).onDidChangeDiagnostics = vi.fn(() => ({
      dispose: vi.fn(),
    }));
    (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
      get: () => true,
    }));

    const mod = await import('../../src/insights/plugins/diagnostics');
    DiagnosticCollector = mod.DiagnosticCollector;
  });

  it('sends diagnostics-remove for files no longer in the list', () => {
    const postMessage = vi.fn();
    const collector = new DiagnosticCollector(postMessage);
    collector.startInspection('w1', '/repo', [makeFile('a.ts'), makeFile('b.ts')]);

    postMessage.mockClear();
    collector.updateFiles([makeFile('a.ts')]);

    const removeMsg = postMessage.mock.calls.find(
      ([msg]: [{ type: string }]) => msg.type === 'diagnostics-remove'
    );
    expect(removeMsg).toBeDefined();
    expect(removeMsg![0]).toEqual({
      type: 'diagnostics-remove',
      worktreeId: 'w1',
      filePaths: ['b.ts'],
    });

    collector.dispose();
  });

  it('does not send diagnostics-remove when no files are removed', () => {
    const postMessage = vi.fn();
    const collector = new DiagnosticCollector(postMessage);
    collector.startInspection('w1', '/repo', [makeFile('a.ts')]);

    postMessage.mockClear();
    collector.updateFiles([makeFile('a.ts'), makeFile('b.ts')]);

    const removeMsg = postMessage.mock.calls.find(
      ([msg]: [{ type: string }]) => msg.type === 'diagnostics-remove'
    );
    expect(removeMsg).toBeUndefined();

    collector.dispose();
  });
});
