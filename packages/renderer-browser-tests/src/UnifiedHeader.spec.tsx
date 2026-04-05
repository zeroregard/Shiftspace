import { test, expect } from '@playwright/experimental-ct-react';
import { UnifiedHeader } from '@shiftspace/renderer-core/src/shared/UnifiedHeader';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/ActionsContext';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { createMockWorktreeWithFiles } from './fixtures/mockWorktree';
import { createMockFile } from './fixtures/mockFiles';
import { resetAllStores, seedWorktree, enterInspectionMode } from './fixtures/storeHelpers';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ width: 800, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

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
