import { describe, it, expect } from 'vitest';
import { resolveCommand, requiresPackage } from '../../src/actions/command-resolver';

describe('resolveCommand', () => {
  it('returns command as-is when no {package} template', () => {
    expect(resolveCommand('pnpm lint:check', '')).toBe('pnpm lint:check');
  });

  it('substitutes {package} with the package name', () => {
    expect(resolveCommand('turbo run lint --filter={package}', 'studio')).toBe(
      'turbo run lint --filter=studio'
    );
  });

  it('returns null when {package} present but no package selected', () => {
    expect(resolveCommand('turbo run lint --filter={package}', '')).toBeNull();
  });

  it('substitutes multiple {package} occurrences', () => {
    expect(resolveCommand('{package} && echo {package}', 'web')).toBe('web && echo web');
  });

  it('returns null for template with {package} and undefined-ish empty string', () => {
    expect(resolveCommand('pnpm --filter={package} test', '')).toBeNull();
  });

  it('handles command without {package} even when package is empty', () => {
    expect(resolveCommand('pnpm run fmt', '')).toBe('pnpm run fmt');
  });
});

describe('requiresPackage', () => {
  it('returns true for commands containing {package}', () => {
    expect(requiresPackage('turbo run test --filter={package}')).toBe(true);
  });

  it('returns false for commands without {package}', () => {
    expect(requiresPackage('pnpm run fmt')).toBe(false);
  });
});
