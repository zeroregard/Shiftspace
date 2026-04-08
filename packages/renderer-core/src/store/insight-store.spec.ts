import { describe, it, expect, beforeEach } from 'vitest';
import { useInsightStore } from './insight-store';
import type { FileDiagnosticSummary, InsightDetail } from '../types';
import { storeKey } from '../utils/store-keys';

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

  it('setFileDiagnostics preserves Map reference when data is unchanged', () => {
    const { setFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts', 2, 1)]);
    const before = useInsightStore.getState().fileDiagnostics;

    // Send identical data again — should be a no-op
    setFileDiagnostics('w1', [makeDiag('a.ts', 2, 1)]);
    const after = useInsightStore.getState().fileDiagnostics;

    expect(after).toBe(before);
  });

  it('setFileDiagnostics updates Map when counts change', () => {
    const { setFileDiagnostics } = useInsightStore.getState();

    setFileDiagnostics('w1', [makeDiag('a.ts', 2, 1)]);
    const before = useInsightStore.getState().fileDiagnostics;

    // Different error count — must update
    setFileDiagnostics('w1', [makeDiag('a.ts', 3, 1)]);
    const after = useInsightStore.getState().fileDiagnostics;

    expect(after).not.toBe(before);
    expect(after.get(storeKey('w1', 'a.ts'))?.errors).toBe(3);
  });
});

describe('insightStore – insights stability', () => {
  beforeEach(() => {
    useInsightStore.setState({
      fileDiagnostics: new Map(),
      insightDetails: new Map(),
      findingsIndex: new Map(),
    });
  });

  function makeDetail(
    worktreeId: string,
    insightId: string,
    files: Record<string, number>
  ): InsightDetail {
    return {
      insightId,
      worktreeId,
      fileInsights: Object.entries(files).map(([filePath, count]) => ({
        filePath,
        findings: [{ ruleId: 'rule1', ruleLabel: 'Rule 1', count, threshold: 1 }],
      })),
    };
  }

  it('setInsightDetail preserves state when insight data is unchanged', () => {
    const { setInsightDetail } = useInsightStore.getState();

    setInsightDetail('w1', 'smell1', makeDetail('w1', 'smell1', { 'a.ts': 3 }));
    const before = useInsightStore.getState();

    // Send identical insight again
    setInsightDetail('w1', 'smell1', makeDetail('w1', 'smell1', { 'a.ts': 3 }));
    const after = useInsightStore.getState();

    // Both Maps should be the same reference (no store update occurred)
    expect(after.insightDetails).toBe(before.insightDetails);
    expect(after.findingsIndex).toBe(before.findingsIndex);
  });

  it('setInsightDetail updates when findings change', () => {
    const { setInsightDetail } = useInsightStore.getState();

    setInsightDetail('w1', 'smell1', makeDetail('w1', 'smell1', { 'a.ts': 3 }));
    const before = useInsightStore.getState();

    // Different count
    setInsightDetail('w1', 'smell1', makeDetail('w1', 'smell1', { 'a.ts': 5 }));
    const after = useInsightStore.getState();

    expect(after.insightDetails).not.toBe(before.insightDetails);
    expect(after.findingsIndex).not.toBe(before.findingsIndex);
  });

  it('rebuildFindingsIndex preserves array references for unchanged files', () => {
    const { setInsightDetail } = useInsightStore.getState();

    // Set up two files via an insight
    setInsightDetail('w1', 'smell1', {
      insightId: 'smell1',
      worktreeId: 'w1',
      fileInsights: [
        { filePath: 'a.ts', findings: [{ ruleId: 'r1', ruleLabel: 'R1', count: 2, threshold: 1 }] },
        { filePath: 'b.ts', findings: [{ ruleId: 'r1', ruleLabel: 'R1', count: 1, threshold: 1 }] },
      ],
    });
    const indexBefore = useInsightStore.getState().findingsIndex;
    const aFindingsBefore = indexBefore.get(storeKey('w1', 'a.ts'));

    // Update with a different insight that doesn't touch a.ts
    setInsightDetail('w1', 'smell2', makeDetail('w1', 'smell2', { 'c.ts': 1 }));
    const indexAfter = useInsightStore.getState().findingsIndex;
    const aFindingsAfter = indexAfter.get(storeKey('w1', 'a.ts'));

    // a.ts findings should be the exact same array reference
    expect(aFindingsAfter).toBe(aFindingsBefore);
  });
});
