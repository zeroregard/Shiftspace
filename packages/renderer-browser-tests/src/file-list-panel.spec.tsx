import { test, expect } from '@playwright/experimental-ct-react';
import { FileListPanel } from '@shiftspace/renderer-inspection/src/components/file-list-panel';
import { createMockWorktreeWithFiles } from './fixtures/mock-worktree';
import {
  createMockFile,
  createStagedFile,
  createDeletedFile,
  createAddedFile,
  createPartiallyStagedFile,
} from './fixtures/mock-files';
import { resetAllStores } from './fixtures/store-helpers';
import { FileListPanelWrapper as Wrapper } from './fixtures/wrappers';

test.beforeEach(() => {
  resetAllStores();
});

test.describe('FileListPanel', () => {
  test('default with staged and unstaged sections', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([
      createStagedFile({ path: 'src/App.tsx' }),
      createStagedFile({ path: 'src/index.ts' }),
      createMockFile({ path: 'src/utils.ts' }),
      createDeletedFile({ path: 'old.js' }),
    ]);

    const component = await mount(
      <Wrapper>
        <FileListPanel wt={wt} findingsIndex={new Map()} fileDiagnostics={new Map()} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-default.png');
  });

  test('empty state with no changes', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([]);

    const component = await mount(
      <Wrapper>
        <FileListPanel wt={wt} findingsIndex={new Map()} fileDiagnostics={new Map()} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-empty.png');
  });

  test('with search query active', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([
      createStagedFile({ path: 'src/App.tsx' }),
      createMockFile({ path: 'src/utils.ts' }),
      createAddedFile({ path: 'src/components/NewFeature.tsx' }),
    ]);

    const component = await mount(
      <Wrapper searchQuery="App">
        <FileListPanel wt={wt} findingsIndex={new Map()} fileDiagnostics={new Map()} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-search-active.png');
  });

  test('partially staged file in both sections', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([
      createPartiallyStagedFile(),
      createMockFile({ path: 'src/other.ts' }),
    ]);

    const component = await mount(
      <Wrapper>
        <FileListPanel wt={wt} findingsIndex={new Map()} fileDiagnostics={new Map()} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-partial-staging.png');
  });

  test('no matching files message', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'src/utils.ts' })]);

    const component = await mount(
      <Wrapper searchQuery="zzz-no-match">
        <FileListPanel wt={wt} findingsIndex={new Map()} fileDiagnostics={new Map()} />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-no-matches.png');
  });
});
