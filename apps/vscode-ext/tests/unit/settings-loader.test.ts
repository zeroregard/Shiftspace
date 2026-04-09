import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isInsightEnabled, getInsightSettings } from '../../src/insights/settings-loader';
import * as vscode from 'vscode';

describe('isInsightEnabled', () => {
  beforeEach(() => {
    (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
      get: vi.fn(() => undefined),
    }));
  });

  it('returns true by default when no setting is configured', () => {
    expect(isInsightEnabled('codeSmells')).toBe(true);
  });

  it('returns false when setting is explicitly false', () => {
    (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
      get: vi.fn(() => false),
    }));
    expect(isInsightEnabled('codeSmells')).toBe(false);
  });

  it('returns true when setting is explicitly true', () => {
    (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
      get: vi.fn(() => true),
    }));
    expect(isInsightEnabled('codeSmells')).toBe(true);
  });
});

describe('getInsightSettings', () => {
  beforeEach(() => {
    (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
      get: vi.fn(() => undefined),
    }));
  });

  it('returns defaults merged with enabled flag', () => {
    const defaults = { threshold: 5, maxFiles: 100 };
    const result = getInsightSettings('codeSmells', defaults);
    expect(result.threshold).toBe(5);
    expect(result.maxFiles).toBe(100);
    expect(result.enabled).toBe(true);
  });

  it('sets enabled to false when configured', () => {
    (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
      get: vi.fn(() => false),
    }));
    const result = getInsightSettings('codeSmells', {});
    expect(result.enabled).toBe(false);
  });
});
