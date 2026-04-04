import type * as vscode from 'vscode';
import type { DiffMode } from '@shiftspace/renderer';

export interface PersistedViewSettings {
  /** App mode, using branch name instead of worktree ID for stability. */
  mode: { type: 'grove' } | { type: 'inspection'; branch: string };
  /** Per-branch diff mode overrides (branch name → DiffMode). */
  diffModeOverrides: Record<string, DiffMode>;
  /** Selected package filter. */
  selectedPackage: string;
}

const VIEW_SETTINGS_KEY = 'shiftspace.viewSettings';

const DEFAULT_VIEW_SETTINGS: PersistedViewSettings = {
  mode: { type: 'grove' },
  diffModeOverrides: {},
  selectedPackage: '',
};

export class ViewSettingsStore {
  constructor(private readonly _state: vscode.Memento) {}

  get(): PersistedViewSettings {
    return this._state.get<PersistedViewSettings>(VIEW_SETTINGS_KEY, DEFAULT_VIEW_SETTINGS);
  }

  save(patch: Partial<PersistedViewSettings>): void {
    const current = this.get();
    void this._state.update(VIEW_SETTINGS_KEY, { ...current, ...patch });
  }
}
