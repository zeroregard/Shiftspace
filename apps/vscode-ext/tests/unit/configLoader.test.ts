import { describe, it, expect } from 'vitest';
import {
  parseShiftspaceConfig,
  validateConfig,
  mergeConfigs,
} from '../../src/actions/configLoader';
import type { ShiftspaceConfig, ShiftspaceActionConfig } from '../../src/actions/types';

const sampleConfig: ShiftspaceConfig = {
  actions: [
    { id: 'fmt', label: 'Format', command: 'pnpm run fmt', type: 'check', icon: 'whitespace' },
    { id: 'lint', label: 'Lint', command: 'pnpm run lint', type: 'check', icon: 'checklist' },
    { id: 'dev', label: 'Dev Server', command: 'pnpm dev', type: 'service', icon: 'play' },
  ],
  pipelines: {
    verify: { steps: ['fmt', 'lint'], stopOnFailure: true },
  },
};

describe('parseShiftspaceConfig', () => {
  it('parses valid JSON with actions', () => {
    const config = parseShiftspaceConfig(JSON.stringify(sampleConfig));
    expect(config.actions).toHaveLength(3);
    expect(config.actions[0]!.id).toBe('fmt');
  });

  it('parses config with pipelines', () => {
    const config = parseShiftspaceConfig(JSON.stringify(sampleConfig));
    expect(config.pipelines?.verify?.steps).toEqual(['fmt', 'lint']);
    expect(config.pipelines?.verify?.stopOnFailure).toBe(true);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseShiftspaceConfig('not json')).toThrow();
  });

  it('throws when actions field is missing', () => {
    expect(() => parseShiftspaceConfig('{}')).toThrow('missing "actions"');
  });
});

describe('validateConfig', () => {
  it('returns empty array for valid config', () => {
    expect(validateConfig(sampleConfig)).toEqual([]);
  });

  it('detects duplicate action ids', () => {
    const config: ShiftspaceConfig = {
      actions: [
        { id: 'fmt', label: 'Format', command: 'pnpm fmt', type: 'check', icon: 'whitespace' },
        { id: 'fmt', label: 'Format 2', command: 'pnpm fmt2', type: 'check', icon: 'whitespace' },
      ],
    };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('Duplicate action id'))).toBe(true);
  });

  it('detects invalid type', () => {
    const config = {
      actions: [{ id: 'bad', label: 'Bad', command: 'cmd', type: 'unknown' as 'check', icon: 'x' }],
    };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('invalid type'))).toBe(true);
  });

  it('detects pipeline referencing unknown action', () => {
    const config: ShiftspaceConfig = {
      actions: [
        { id: 'fmt', label: 'Format', command: 'pnpm fmt', type: 'check', icon: 'whitespace' },
      ],
      pipelines: { verify: { steps: ['fmt', 'nonexistent'], stopOnFailure: true } },
    };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });
});

describe('mergeConfigs', () => {
  const base: ShiftspaceActionConfig[] = [
    { id: 'fmt', label: 'Format', command: 'pnpm fmt', type: 'check', icon: 'whitespace' },
    { id: 'lint', label: 'Lint', command: 'pnpm lint', type: 'check', icon: 'checklist' },
  ];

  it('returns base when no overrides', () => {
    const result = mergeConfigs(base, []);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('fmt');
  });

  it('appends new actions from overrides', () => {
    const overrides: ShiftspaceActionConfig[] = [
      { id: 'test', label: 'Test', command: 'pnpm test', type: 'check', icon: 'beaker' },
    ];
    const result = mergeConfigs(base, overrides);
    expect(result).toHaveLength(3);
    expect(result.some((a) => a.id === 'test')).toBe(true);
  });

  it('overrides win on duplicate id', () => {
    const overrides: ShiftspaceActionConfig[] = [
      { id: 'fmt', label: 'My Format', command: 'my-fmt', type: 'check', icon: 'whitespace' },
    ];
    const result = mergeConfigs(base, overrides);
    const fmt = result.find((a) => a.id === 'fmt');
    expect(fmt?.label).toBe('My Format');
    expect(fmt?.command).toBe('my-fmt');
  });

  it('does not duplicate entries', () => {
    const overrides: ShiftspaceActionConfig[] = [
      { id: 'fmt', label: 'My Format', command: 'my-fmt', type: 'check', icon: 'whitespace' },
    ];
    const result = mergeConfigs(base, overrides);
    expect(result).toHaveLength(2); // still 2, not 3
  });
});
