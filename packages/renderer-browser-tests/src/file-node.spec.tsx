import { test, expect } from '@playwright/experimental-ct-react';
import { FileNode } from '@shiftspace/renderer-core/src/nodes/file-node';
import {
  createMockFile,
  createDeletedFile,
  createAddedFile,
  createStagedFile,
} from './fixtures/mock-files';
import { createFileDiagnostics, createInsightDetail } from './fixtures/mock-insights';
import { resetAllStores, seedFileDiagnostics, seedInsightDetail } from './fixtures/store-helpers';
import { FileNodeWrapper as Wrapper } from './fixtures/wrappers';

test.beforeEach(() => {
  resetAllStores();
});

test.describe('FileNode', () => {
  test('default modified file', async ({ mount }) => {
    const file = createMockFile();
    const component = await mount(
      <Wrapper>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-default.png');
  });

  test('deleted file', async ({ mount }) => {
    const file = createDeletedFile();
    const component = await mount(
      <Wrapper>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-deleted.png');
  });

  test('added file', async ({ mount }) => {
    const file = createAddedFile();
    const component = await mount(
      <Wrapper>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-added.png');
  });

  test('staged file', async ({ mount }) => {
    const file = createStagedFile();
    const component = await mount(
      <Wrapper>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-staged.png');
  });

  test('with error badge', async ({ mount }) => {
    const file = createMockFile({ path: 'src/app/page.tsx' });
    seedFileDiagnostics('wt-test', [createFileDiagnostics('src/app/page.tsx', 2, 0)]);

    const component = await mount(
      <Wrapper>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-error-badge.png');
  });

  test('with warning badge', async ({ mount }) => {
    const file = createMockFile({ path: 'src/lib/api.ts' });
    seedFileDiagnostics('wt-test', [createFileDiagnostics('src/lib/api.ts', 0, 3)]);

    const component = await mount(
      <Wrapper>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-warning-badge.png');
  });

  test('with insight findings', async ({ mount }) => {
    const file = createMockFile({ path: 'src/utils/debug.ts' });
    seedInsightDetail(
      'wt-test',
      'code-smell',
      createInsightDetail('wt-test', 'code-smell', [
        {
          filePath: 'src/utils/debug.ts',
          findings: [{ ruleId: 'console-log', ruleLabel: 'console.log', count: 5, threshold: 1 }],
        },
      ])
    );

    const component = await mount(
      <Wrapper>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-findings.png');
  });

  test('hovered via inspection context', async ({ mount }) => {
    const file = createMockFile();
    const component = await mount(
      <Wrapper hoveredFilePath={file.path}>
        <FileNode data={{ file, worktreeId: 'wt-test' }} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-node-hovered.png');
  });
});
