import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/git/**/*.ts', 'src/actions/**/*.ts', 'src/insights/**/*.ts'],
      exclude: [
        'src/actions/action-coordinator.ts',
        'src/actions/package-detector.ts',
        'src/actions/detect.ts',
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
      // Resolve @shiftspace/renderer to source so tests don't need a build step
      '@shiftspace/renderer': new URL('../../packages/renderer/src/index.ts', import.meta.url)
        .pathname,
      // Stub out vscode for unit tests (not available outside extension host)
      vscode: new URL('./tests/__mocks__/vscode.ts', import.meta.url).pathname,
    },
  },
});
