import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/git/**/*.ts', 'src/actions/**/*.ts', 'src/insights/**/*.ts'],
      exclude: [
        'src/actions/ActionCoordinator.ts',
        'src/actions/packageDetector.ts',
        'src/actions/detect.ts',
        // Re-export shims (logic now lives in @shiftspace/core)
        'src/actions/commandResolver.ts',
        'src/actions/runner.ts',
        'src/actions/pipelineRunner.ts',
        'src/actions/stateManager.ts',
        'src/actions/logStore.ts',
        'src/actions/types.ts',
        'src/git/gitUtils.ts',
        'src/git/status.ts',
        'src/git/eventDiff.ts',
        'src/git/ignoreFilter.ts',
        'src/git/worktrees.ts',
        'src/insights/types.ts',
        'src/insights/registry.ts',
        'src/insights/runner.ts',
        'src/insights/plugins/codeSmells.ts',
        'src/git/RepoTracker.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
      },
      reportsDirectory: 'coverage',
    },
  },
  resolve: {
    alias: {
      // Resolve workspace packages to source so tests don't need a build step
      '@shiftspace/renderer': new URL('../../packages/renderer/src/index.ts', import.meta.url)
        .pathname,
      '@shiftspace/core': new URL('../../packages/core/src/index.ts', import.meta.url).pathname,
      // Stub out vscode for unit tests (not available outside extension host)
      vscode: new URL('./tests/__mocks__/vscode.ts', import.meta.url).pathname,
    },
  },
});
