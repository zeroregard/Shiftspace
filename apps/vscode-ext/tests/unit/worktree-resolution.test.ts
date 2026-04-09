import { describe, it, expect } from 'vitest';
import { McpToolHandlers } from '../../src/mcp/handlers';
import type { McpHandlerDeps } from '../../src/mcp/handlers';
import type { WorktreeState } from '@shiftspace/renderer';
import { StateManager } from '../../src/actions/state-manager';

function makeWorktree(id: string, wtPath: string, branch: string): WorktreeState {
  return {
    id,
    path: wtPath,
    branch,
    files: [],
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: id === 'main',
  };
}

function makeDeps(worktrees: WorktreeState[]): McpHandlerDeps {
  return {
    worktreeProvider: { getWorktrees: () => worktrees },
    configLoader: { config: { actions: [] } } as unknown as McpHandlerDeps['configLoader'],
    stateManager: new StateManager(),
    repoRoot: '/repo',
    getPackageName: () => '',
  };
}

describe('Worktree Resolution', () => {
  it('uses the first worktree when no cwd provided', async () => {
    const worktrees = [
      makeWorktree('wt-main', '/repo', 'main'),
      makeWorktree('wt-feat', '/repo-feat', 'feature'),
    ];
    const handlers = new McpToolHandlers(makeDeps(worktrees));

    const result = (await handlers.handleTool('get_changed_files', {})) as Record<string, unknown>;
    const wt = result['worktree'] as Record<string, unknown>;
    expect(wt['id']).toBe('wt-main');
  });

  it('returns error when no worktrees exist and no cwd provided', async () => {
    const handlers = new McpToolHandlers(makeDeps([]));
    const result = (await handlers.handleTool('get_changed_files', {})) as Record<string, unknown>;
    expect(result['error']).toContain('No worktree found');
  });

  it('returns error for cwd not in any worktree', async () => {
    const worktrees = [makeWorktree('wt-main', '/repo', 'main')];
    const handlers = new McpToolHandlers(makeDeps(worktrees));

    // /nonexistent is not a git repo, so git rev-parse will fail
    const result = (await handlers.handleTool('get_changed_files', {
      cwd: '/nonexistent',
    })) as Record<string, unknown>;
    expect(result['error']).toContain('No worktree found');
  });
});
