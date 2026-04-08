import { test, expect } from '@playwright/experimental-ct-react';
import { UnifiedHeader } from '@shiftspace/renderer-core/src/shared/unified-header';
import { createMockWorktreeWithFiles } from './fixtures/mock-worktree';
import { createMockFile } from './fixtures/mock-files';
import { resetAllStores, seedWorktree, enterInspectionMode } from './fixtures/store-helpers';
import { UnifiedHeaderWrapper as Wrapper } from './fixtures/wrappers';

test.beforeEach(() => {
  resetAllStores();
});

test.describe('UnifiedHeader', () => {
  test('grove mode (minimal header)', async ({ mount }) => {
    const component = await mount(
      <Wrapper>
        <UnifiedHeader showPackageSwitcher={false} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('unified-header-grove.png');
  });

  test('inspection mode with branch and diff mode', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'src/App.tsx' })], {
      id: 'wt-0',
      branch: 'feature/auth',
      defaultBranch: 'main',
    });
    seedWorktree(wt);
    enterInspectionMode('wt-0');

    const component = await mount(
      <Wrapper>
        <UnifiedHeader showPackageSwitcher={false} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('unified-header-inspection.png');
  });
});
