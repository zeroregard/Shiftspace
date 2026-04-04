import { describe, it, expect, beforeEach } from 'vitest';
import { useInsightStore } from './insightStore';
import type { FileDiagnosticSummary } from '../types';
import { storeKey } from '../utils/storeKeys';

function makeDiag(filePath: string, errors = 1, warnings = 0): FileDiagnosticSummary {
  return { filePath, errors, warnings, info: 0, hints: 0, details: [] };
}

describe('insightStore – fileDiagnostics', () => {
  beforeEach(() => {
    // Reset to initial state
    useInsightStore.setState({
      fileDiagnostics: new Map(),
      insightDetails: new Map(),
      findingsIndex: new Map(),
    });
  });

  it('setFileDiagnostics merges without deleting existing entries', () => {
    const { setFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts', 1), makeDiag('b.ts', 2), makeDiag('c.ts', 3)]);
    // Update only file a — b and c should remain
    setFileDiagnostics('w1', [makeDiag('a.ts', 10)]);

    const diags = useInsightStore.getState().fileDiagnostics;
    expect(diags.get(storeKey('w1', 'a.ts'))?.errors).toBe(10);
    expect(diags.get(storeKey('w1', 'b.ts'))?.errors).toBe(2);
    expect(diags.get(storeKey('w1', 'c.ts'))?.errors).toBe(3);
  });

  it('setFileDiagnostics overwrites entries for included files', () => {
    const { setFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts', 3)]);
    setFileDiagnostics('w1', [makeDiag('a.ts', 0)]);

    expect(useInsightStore.getState().fileDiagnostics.get(storeKey('w1', 'a.ts'))?.errors).toBe(0);
  });

  it('setFileDiagnostics with empty array is a no-op', () => {
    const { setFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts', 1)]);
    const before = useInsightStore.getState().fileDiagnostics;

    setFileDiagnostics('w1', []);
    const after = useInsightStore.getState().fileDiagnostics;

    // Same reference — no state update
    expect(after).toBe(before);
  });

  it('removeFileDiagnostics removes only specified files', () => {
    const { setFileDiagnostics, removeFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts'), makeDiag('b.ts'), makeDiag('c.ts')]);
    removeFileDiagnostics('w1', ['b.ts']);

    const diags = useInsightStore.getState().fileDiagnostics;
    expect(diags.has(storeKey('w1', 'a.ts'))).toBe(true);
    expect(diags.has(storeKey('w1', 'b.ts'))).toBe(false);
    expect(diags.has(storeKey('w1', 'c.ts'))).toBe(true);
  });

  it('removeFileDiagnostics with empty array is a no-op', () => {
    const { setFileDiagnostics, removeFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts')]);
    const before = useInsightStore.getState().fileDiagnostics;

    removeFileDiagnostics('w1', []);
    const after = useInsightStore.getState().fileDiagnostics;

    expect(after).toBe(before);
  });

  it('clearFileDiagnostics removes all entries for a worktree', () => {
    const { setFileDiagnostics, clearFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts'), makeDiag('b.ts')]);
    setFileDiagnostics('w2', [makeDiag('c.ts')]);

    clearFileDiagnostics('w1');

    const diags = useInsightStore.getState().fileDiagnostics;
    expect(diags.has(storeKey('w1', 'a.ts'))).toBe(false);
    expect(diags.has(storeKey('w1', 'b.ts'))).toBe(false);
    expect(diags.has(storeKey('w2', 'c.ts'))).toBe(true);
  });

  it('different worktrees are independent', () => {
    const { setFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts', 1)]);
    setFileDiagnostics('w2', [makeDiag('a.ts', 5)]);
    // Update w1 — w2 should be untouched
    setFileDiagnostics('w1', [makeDiag('a.ts', 99)]);

    const diags = useInsightStore.getState().fileDiagnostics;
    expect(diags.get(storeKey('w1', 'a.ts'))?.errors).toBe(99);
    expect(diags.get(storeKey('w2', 'a.ts'))?.errors).toBe(5);
  });
});
