import { test, expect } from '@playwright/experimental-ct-react';
import { DiffPopover } from '@shiftspace/renderer-core/src/overlays/DiffPopover';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/ActionsContext';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { createFileWithDiff } from './fixtures/mockFiles';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ padding: 16, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

test.describe('DiffPopover', () => {
  test('closed state wrapping a child', async ({ mount }) => {
    const file = createFileWithDiff();

    const component = await mount(
      <Wrapper>
        <DiffPopover file={file} worktreeId="wt-test">
          <button className="text-text-primary text-11 px-2 py-1 bg-node-file border border-border-default rounded">
            Button.tsx
          </button>
        </DiffPopover>
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('diff-popover-closed.png');
  });

  test('open with typescript diff', async ({ mount, page }) => {
    const file = createFileWithDiff();

    await mount(
      <Wrapper>
        <DiffPopover file={file} worktreeId="wt-test">
          <button
            data-testid="trigger"
            className="text-text-primary text-11 px-2 py-1 bg-node-file border border-border-default rounded"
          >
            Button.tsx
          </button>
        </DiffPopover>
      </Wrapper>
    );

    // Hover over the trigger to activate, then hold Shift to open popover
    const trigger = page.getByTestId('trigger');
    await trigger.hover();
    await page.keyboard.down('Shift');
    await page.waitForTimeout(200);

    // DiffPopover portals to document.body — take a full page screenshot
    await expect(page).toHaveScreenshot('diff-popover-open-ts.png');

    await page.keyboard.up('Shift');
  });
});
