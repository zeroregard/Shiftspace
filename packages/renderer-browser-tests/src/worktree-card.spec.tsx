import { test, expect } from '@playwright/experimental-ct-react';
import { WorktreeCard } from '@shiftspace/renderer-grove/src/components/worktree-card';
import { createMockWorktreeWithFiles } from './fixtures/mock-worktree';
import { createMockFile, createStagedFile, createAddedFile } from './fixtures/mock-files';
import { useOperationStore, opKey } from '@shiftspace/renderer-core/src/store/operation-store.ts';
import {
  resetAllStores,
  seedWorktree,
  seedActionConfigs,
  seedActionState,
  seedPipelines,
} from './fixtures/store-helpers';
import { WorktreeCardWrapper as Wrapper } from './fixtures/wrappers';

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

  test('removing state shows spinner and greyed-out card', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'src/App.tsx' })], {
      id: 'wt-0',
      branch: 'feature/to-delete',
      path: '/projects/myapp-to-delete',
    });
    seedWorktree(wt);
    useOperationStore.getState().startOperation(opKey.removeWorktree('wt-0'), 'wt-0');

    const component = await mount(
      <Wrapper>
        <WorktreeCard worktree={wt} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('worktree-card-removing.png');
  });

  test('delete confirm popover opens on trash click', async ({ mount, page }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'src/App.tsx' })], {
      id: 'wt-0',
      branch: 'feature/auth',
      path: '/projects/myapp-auth',
    });
    seedWorktree(wt);

    const component = await mount(
      <Wrapper>
        <WorktreeCard worktree={wt} />
      </Wrapper>
    );

    // Hover to reveal group-visible buttons, then click trash to open popover
    await component.hover();
    await component.getByTestId('remove-worktree-wt-0').click();
    await page.waitForTimeout(100);

    // Popover portals to document.body — take a full page screenshot
    await expect(page).toHaveScreenshot('worktree-card-delete-popover.png');
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
