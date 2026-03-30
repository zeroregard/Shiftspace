import { describe, it, expect } from 'vitest';
import { validateSmellRules } from '../../src/actions/configLoader';

describe('validateSmellRules', () => {
  it('parses a valid rule', () => {
    const rules = validateSmellRules([
      { id: 'r1', label: 'Rule 1', pattern: 'console\\.log', threshold: 1 },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe('r1');
    expect(rules[0]!.threshold).toBe(1);
  });

  it('skips invalid regex pattern with warning', () => {
    const rules = validateSmellRules([
      { id: 'bad', label: 'Bad', pattern: '[invalid', threshold: 1 },
    ]);
    expect(rules).toHaveLength(0);
  });

  it('skips rules missing required fields', () => {
    const rules = validateSmellRules([
      { label: 'No id', pattern: 'foo', threshold: 1 },
      { id: 'no-label', pattern: 'foo', threshold: 1 },
      { id: 'no-pattern', label: 'NP', threshold: 1 },
    ]);
    expect(rules).toHaveLength(0);
  });

  it('enforces threshold >= 1', () => {
    const rules = validateSmellRules([{ id: 'low', label: 'Low', pattern: 'foo', threshold: 0 }]);
    expect(rules[0]!.threshold).toBe(1);
  });

  it('skips duplicate ids', () => {
    const rules = validateSmellRules([
      { id: 'dup', label: 'Dup 1', pattern: 'foo', threshold: 1 },
      { id: 'dup', label: 'Dup 2', pattern: 'bar', threshold: 1 },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.label).toBe('Dup 1');
  });

  it('parses optional fileTypes array', () => {
    const rules = validateSmellRules([
      { id: 'r', label: 'R', pattern: 'foo', threshold: 1, fileTypes: ['.ts', '.tsx'] },
    ]);
    expect(rules[0]!.fileTypes).toEqual(['.ts', '.tsx']);
  });

  it('fileTypes defaults to undefined when omitted', () => {
    const rules = validateSmellRules([{ id: 'r', label: 'R', pattern: 'foo', threshold: 1 }]);
    expect(rules[0]!.fileTypes).toBeUndefined();
  });

  it('handles empty array', () => {
    expect(validateSmellRules([])).toHaveLength(0);
  });

  it('skips non-object entries', () => {
    const rules = validateSmellRules(['string', null, 42, undefined]);
    expect(rules).toHaveLength(0);
  });

  it('valid regex special chars work', () => {
    const rules = validateSmellRules([
      { id: 'r', label: 'R', pattern: 'useEffect\\s*\\(', threshold: 1 },
    ]);
    expect(rules).toHaveLength(1);
  });
});
