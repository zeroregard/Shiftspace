import { test, expect } from '@playwright/experimental-ct-react';
import { FolderNode } from '@shiftspace/renderer-core/src/nodes/folder-node';
import { FolderNodeWrapper as Wrapper } from './fixtures/wrappers';

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
