/**
 * The worktree card reads its section visibility straight from the settings
 * store, so a mis-read config key silently leaves a section stuck on its
 * default instead of failing loudly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { readRendererSettings, affectsRendererSettings } from '../../src/renderer-settings';

function mockConfig(settings: Record<string, unknown>): void {
  (vscode.workspace as Record<string, unknown>).getConfiguration = vi.fn(() => ({
    get: vi.fn((key: string, fallback: unknown) => settings[key] ?? fallback),
  }));
}

beforeEach(() => {
  mockConfig({});
});

describe('readRendererSettings', () => {
  it('hides the action buttons until hover by default, keeps everything else visible', () => {
    expect(readRendererSettings().worktreeVisibility).toEqual({
      actions: 'hover',
      githubStatus: 'always',
      diffCount: 'always',
      timestamp: 'always',
    });
  });

  it('reads each section from its own configuration key', () => {
    mockConfig({
      'worktree.visibility.actions': 'always',
      'worktree.visibility.githubStatus': 'hover',
      'worktree.visibility.diffCount': 'off',
      'worktree.visibility.timestamp': 'hover',
    });
    expect(readRendererSettings().worktreeVisibility).toEqual({
      actions: 'always',
      githubStatus: 'hover',
      diffCount: 'off',
      timestamp: 'hover',
    });
  });

  it('falls back to the default for an unrecognized value', () => {
    mockConfig({ 'worktree.visibility.timestamp': 'sometimes' });
    expect(readRendererSettings().worktreeVisibility.timestamp).toBe('always');
  });
});

describe('affectsRendererSettings', () => {
  it('reacts to a visibility change', () => {
    const event = {
      affectsConfiguration: (key: string) => key === 'shiftspace.worktree.visibility.githubStatus',
    } as vscode.ConfigurationChangeEvent;
    expect(affectsRendererSettings(event)).toBe(true);
  });

  it('ignores unrelated configuration changes', () => {
    const event = {
      affectsConfiguration: (key: string) => key === 'editor.fontSize',
    } as vscode.ConfigurationChangeEvent;
    expect(affectsRendererSettings(event)).toBe(false);
  });
});
