import { test, expect } from '@playwright/experimental-ct-react';
import { FileListPanel } from '@shiftspace/renderer-inspection/src/components/FileListPanel';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/ActionsContext';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { createMockWorktreeWithFiles } from './fixtures/mockWorktree';
import {
  createMockFile,
  createStagedFile,
  createDeletedFile,
  createAddedFile,
  createPartiallyStagedFile,
} from './fixtures/mockFiles';
import { resetAllStores } from './fixtures/storeHelpers';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div
          style={{
            width: 350,
            height: 500,
            background: 'var(--color-canvas)',
            display: 'flex',
          }}
        >
          {children}
        </div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

const noopFn = () => {};

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
        <FileListPanel
          wt={wt}
          searchQuery=""
          onSearchChange={noopFn}
          problemsOnly={false}
          onProblemsOnlyChange={noopFn}
          findingsIndex={new Map()}
          fileDiagnostics={new Map()}
          onFileClick={noopFn}
          onHoverFile={noopFn}
        />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-default.png');
  });

  test('empty state with no changes', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([]);

    const component = await mount(
      <Wrapper>
        <FileListPanel
          wt={wt}
          searchQuery=""
          onSearchChange={noopFn}
          problemsOnly={false}
          onProblemsOnlyChange={noopFn}
          findingsIndex={new Map()}
          fileDiagnostics={new Map()}
          onFileClick={noopFn}
          onHoverFile={noopFn}
        />
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
      <Wrapper>
        <FileListPanel
          wt={wt}
          searchQuery="App"
          onSearchChange={noopFn}
          problemsOnly={false}
          onProblemsOnlyChange={noopFn}
          findingsIndex={new Map()}
          fileDiagnostics={new Map()}
          onFileClick={noopFn}
          onHoverFile={noopFn}
        />
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
        <FileListPanel
          wt={wt}
          searchQuery=""
          onSearchChange={noopFn}
          problemsOnly={false}
          onProblemsOnlyChange={noopFn}
          findingsIndex={new Map()}
          fileDiagnostics={new Map()}
          onFileClick={noopFn}
          onHoverFile={noopFn}
        />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-partial-staging.png');
  });

  test('no matching files message', async ({ mount }) => {
    const wt = createMockWorktreeWithFiles([createMockFile({ path: 'src/utils.ts' })]);

    const component = await mount(
      <Wrapper>
        <FileListPanel
          wt={wt}
          searchQuery="zzz-no-match"
          onSearchChange={noopFn}
          problemsOnly={false}
          onProblemsOnlyChange={noopFn}
          findingsIndex={new Map()}
          fileDiagnostics={new Map()}
          onFileClick={noopFn}
          onHoverFile={noopFn}
        />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('file-list-no-matches.png');
  });
});
