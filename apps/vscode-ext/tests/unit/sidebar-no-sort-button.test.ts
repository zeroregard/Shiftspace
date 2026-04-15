import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The worktree sort picker lives in the renderer's UnifiedHeader as a
 * popover button. A second sort entrypoint used to exist as a view/title
 * button on the primary sidebar (the activity-bar webview view). Having
 * two sort controls was redundant and confusing, and this button has a
 * habit of sneaking back in when the package manifest is edited — so
 * this test pins it down.
 *
 * If you see this test fail: remove the `shiftspace.sortWorktrees`
 * command declaration and/or the `view/title` menu contribution from
 * `apps/vscode-ext/package.json`. The in-header SortPicker is the
 * canonical control.
 */
describe('primary sidebar has no sort button', () => {
  const pkgPath = resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    contributes?: {
      commands?: Array<{ command: string }>;
      menus?: { 'view/title'?: Array<{ command: string; when?: string }> };
    };
  };

  it('must not declare the shiftspace.sortWorktrees command', () => {
    const commands = pkg.contributes?.commands ?? [];
    const found = commands.find((c) => c.command === 'shiftspace.sortWorktrees');
    expect(found).toBeUndefined();
  });

  it('must not contribute any view/title entries to the sidebar view', () => {
    const viewTitle = pkg.contributes?.menus?.['view/title'] ?? [];
    const sidebarEntries = viewTitle.filter((m) => (m.when ?? '').includes('shiftspace.sidebar'));
    expect(sidebarEntries).toEqual([]);
  });
});
