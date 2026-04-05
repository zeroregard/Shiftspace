import { test, expect } from '@playwright/experimental-ct-react';
import { WorktreeCard } from '@shiftspace/renderer-grove/src/components/WorktreeCard';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/ActionsContext';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { createMockWorktreeWithFiles } from './fixtures/mockWorktree';
import { createMockFile, createStagedFile, createAddedFile } from './fixtures/mockFiles';
import {
  resetAllStores,
  seedWorktree,
  seedActionConfigs,
  seedActionState,
  seedPipelines,
} from './fixtures/storeHelpers';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ padding: 16, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

test.beforeEach(() => {
  resetAllStores();
});

test.describe('WorktreeCard', () => {
  test('default with files', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles(
      [
        createMockFile({ path: 'src/App.tsx' }),
        createStagedFile({ path: 'src/index.ts' }),
        createAddedFile({ path: 'src/new.ts' }),
      ],
      { id: 'wt-0', branch: 'feature/auth', path: '/projects/myapp-auth' }
    );
    seedWorktree(wt);

    const component = await mount(
      <Wrapper>
        <WorktreeCard worktree={wt} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('worktree-card-default.png');
  });

  test('main worktree (no delete/edit buttons)', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'package.json' })], {
      id: 'wt-main',
      branch: 'main',
      path: '/projects/myapp',
      isMainWorktree: true,
    });
    seedWorktree(wt);

    const component = await mount(
      <Wrapper>
        <WorktreeCard worktree={wt} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('worktree-card-main.png');
  });

  test('with running service port badge', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'src/App.tsx' })], {
      id: 'wt-0',
      branch: 'feature/dev',
      path: '/projects/myapp-dev',
      process: { port: 3000, command: 'next dev' },
    });
    seedWorktree(wt);
    seedActionConfigs([
      { id: 'dev', label: 'Dev Server', icon: 'play', persistent: true, type: 'service' },
    ]);
    seedActionState('wt-0', 'dev', { status: 'running', port: 3000, type: 'service' });

    const component = await mount(
      <Wrapper>
        <WorktreeCard worktree={wt} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('worktree-card-service-running.png');
  });

  test('with action checks', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'src/App.tsx' })], {
      id: 'wt-0',
      branch: 'feature/checks',
      path: '/projects/myapp-checks',
    });
    seedWorktree(wt);
    seedActionConfigs([
      { id: 'fmt', label: 'Format', icon: 'whole-word', persistent: false, type: 'check' },
      { id: 'lint', label: 'Lint', icon: 'checklist', persistent: false, type: 'check' },
      { id: 'test', label: 'Test', icon: 'beaker', persistent: false, type: 'check' },
    ]);
    seedPipelines({ default: { steps: ['fmt', 'lint', 'test'], stopOnFailure: true } });
    seedActionState('wt-0', 'fmt', { status: 'passed', durationMs: 1200, type: 'check' });
    seedActionState('wt-0', 'lint', { status: 'failed', durationMs: 3400, type: 'check' });
    seedActionState('wt-0', 'test', { status: 'idle', type: 'check' });

    const component = await mount(
      <Wrapper>
        <WorktreeCard worktree={wt} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('worktree-card-checks.png');
  });
});
