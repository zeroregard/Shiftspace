import type { WorktreeState, DiffMode, FileChange } from '@shiftspace/renderer-core';

export function createMockWorktree(overrides?: Partial<WorktreeState>): WorktreeState {
  return {
    id: 'wt-test',
    path: '/home/user/project',
    branch: 'feature/test',
    files: [],
    diffMode: { type: 'working' } as DiffMode,
    defaultBranch: 'main',
    isMainWorktree: false,
    ...overrides,
  };
}

export function createMockWorktreeWithFiles(
  files: FileChange[],
  overrides?: Partial<WorktreeState>
): WorktreeState {
  return createMockWorktree({ files, ...overrides });
}
