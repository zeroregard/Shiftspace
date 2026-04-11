import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('vite.config.ts', () => {
  const configPath = resolve(__dirname, '../../vite.config.ts');
  const configSource = readFileSync(configPath, 'utf-8');

  it('must set process.env.NODE_ENV to production', () => {
    // Shipping development React makes the bundle ~3x larger and significantly
    // slower. This guard exists because it was accidentally switched to
    // 'development' once during debugging (commit b241ab8).
    expect(configSource).toContain(`JSON.stringify('production')`);
    expect(configSource).not.toContain(`JSON.stringify('development')`);
  });
});
