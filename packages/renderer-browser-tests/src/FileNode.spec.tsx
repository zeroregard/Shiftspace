import { test, expect } from '@playwright/experimental-ct-react';
import { FileNode } from '@shiftspace/renderer-core/src/nodes/FileNode';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/ActionsContext';
import { InspectionHoverContext } from '@shiftspace/renderer-core/src/shared/InspectionHoverContext';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import {
  createMockFile,
  createDeletedFile,
  createAddedFile,
  createStagedFile,
} from './fixtures/mockFiles';
import { createFileDiagnostics, createInsightDetail } from './fixtures/mockInsights';
import { resetAllStores, seedFileDiagnostics, seedInsightDetail } from './fixtures/storeHelpers';

function Wrapper({
  children,
  hoveredFilePath = null,
}: {
  children: React.ReactNode;
  hoveredFilePath?: string | null;
}) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <InspectionHoverContext.Provider value={{ hoveredFilePath }}>
          <div style={{ width: 180, padding: 8, background: 'var(--color-canvas)' }}>
            {children}
          </div>
        </InspectionHoverContext.Provider>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

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
