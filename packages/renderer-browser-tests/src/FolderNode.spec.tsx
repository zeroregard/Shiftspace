import { test, expect } from '@playwright/experimental-ct-react';
import { FolderNode } from '@shiftspace/renderer-core/src/nodes/FolderNode';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/ActionsContext';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ActionsProvider>
      <div style={{ width: 180, padding: 8, background: 'var(--color-canvas)' }}>{children}</div>
    </ActionsProvider>
  );
}

test.describe('FolderNode', () => {
  test('short name', async ({ mount }) => {
    const component = await mount(
      <Wrapper>
        <FolderNode
          data={{ name: 'components', folderPath: 'src/components', worktreeId: 'wt-0' }}
        />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('folder-node-short-name.png');
  });

  test('long collapsed path', async ({ mount }) => {
    const component = await mount(
      <Wrapper>
        <FolderNode
          data={{
            name: 'src/lib/utils/helpers',
            folderPath: 'src/lib/utils/helpers',
            worktreeId: 'wt-0',
          }}
        />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('folder-node-long-path.png');
  });
});
