import { test, expect } from '@playwright/experimental-ct-react';
import { UnifiedHeader } from '@shiftspace/renderer-core/src/shared/UnifiedHeader';
import { createMockWorktreeWithFiles } from './fixtures/mockWorktree';
import { createMockFile } from './fixtures/mockFiles';
import { resetAllStores, seedWorktree, enterInspectionMode } from './fixtures/storeHelpers';
import { UnifiedHeaderWrapper as Wrapper } from './fixtures/Wrappers';

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
