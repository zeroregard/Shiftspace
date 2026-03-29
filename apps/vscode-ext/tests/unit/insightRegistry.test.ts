import { describe, it, expect } from 'vitest';
import { InsightRegistry } from '../../src/insights/registry';
import type { InsightPlugin, InsightSummary, InsightDetail } from '../../src/insights/types';

function makePlugin(id: string): InsightPlugin {
  return {
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    icon: 'beaker',
    defaultSettings: { threshold: 0.5 },
    async analyze() {
      const summary: InsightSummary = {
        insightId: id,
        worktreeId: '',
        score: 0,
        label: '0 issues',
        severity: 'none',
      };
      const detail: InsightDetail = {
        insightId: id,
        worktreeId: '',
        data: {},
      };
      return { summary, detail };
    },
  };
}

describe('InsightRegistry', () => {
  it('register and get a plugin', () => {
    const registry = new InsightRegistry();
    const plugin = makePlugin('test');
    registry.register(plugin);
    expect(registry.get('test')).toBe(plugin);
  });

  it('returns undefined for unregistered plugin', () => {
    const registry = new InsightRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('getAll returns all registered plugins', () => {
    const registry = new InsightRegistry();
    registry.register(makePlugin('a'));
    registry.register(makePlugin('b'));
    registry.register(makePlugin('c'));
    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('overwrites plugin with same id', () => {
    const registry = new InsightRegistry();
    const p1 = makePlugin('dup');
    const p2 = makePlugin('dup');
    p2.label = 'Updated';
    registry.register(p1);
    registry.register(p2);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('dup')?.label).toBe('Updated');
  });

  it('returns empty array when no plugins registered', () => {
    const registry = new InsightRegistry();
    expect(registry.getAll()).toEqual([]);
  });
});
