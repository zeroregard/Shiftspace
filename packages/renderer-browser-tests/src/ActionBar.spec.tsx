import { test, expect } from '@playwright/experimental-ct-react';
import { ActionBar } from '@shiftspace/renderer-core/src/components/ActionBar';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/ActionsContext';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import {
  resetAllStores,
  seedActionConfigs,
  seedActionState,
  seedPipelines,
} from './fixtures/storeHelpers';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ padding: 8, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

test.beforeEach(() => {
  resetAllStores();
});

test.describe('ActionBar', () => {
  test('idle checks', async ({ mount }) => {
    seedActionConfigs([
      { id: 'fmt', label: 'Format', icon: 'whole-word', persistent: false, type: 'check' },
      { id: 'lint', label: 'Lint', icon: 'checklist', persistent: false, type: 'check' },
      { id: 'test', label: 'Test', icon: 'beaker', persistent: false, type: 'check' },
    ]);
    seedPipelines({ default: { steps: ['fmt', 'lint', 'test'], stopOnFailure: true } });

    const component = await mount(
      <Wrapper>
        <ActionBar worktreeId="wt-0" />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('action-bar-idle.png');
  });

  test('mixed check states (passed, failed, idle)', async ({ mount }) => {
    seedActionConfigs([
      { id: 'fmt', label: 'Format', icon: 'whole-word', persistent: false, type: 'check' },
      { id: 'lint', label: 'Lint', icon: 'checklist', persistent: false, type: 'check' },
      { id: 'test', label: 'Test', icon: 'beaker', persistent: false, type: 'check' },
    ]);
    seedPipelines({ default: { steps: ['fmt', 'lint', 'test'], stopOnFailure: true } });
    seedActionState('wt-0', 'fmt', { status: 'passed', durationMs: 800, type: 'check' });
    seedActionState('wt-0', 'lint', { status: 'failed', durationMs: 2100, type: 'check' });

    const component = await mount(
      <Wrapper>
        <ActionBar worktreeId="wt-0" />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('action-bar-mixed.png');
  });

  test('with running service', async ({ mount }) => {
    seedActionConfigs([
      { id: 'dev', label: 'Dev Server', icon: 'play', persistent: true, type: 'service' },
    ]);
    seedActionState('wt-0', 'dev', { status: 'running', port: 3000, type: 'service' });

    const component = await mount(
      <Wrapper>
        <ActionBar worktreeId="wt-0" />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('action-bar-service-running.png');
  });

  test('checks and services combined', async ({ mount }) => {
    seedActionConfigs([
      { id: 'lint', label: 'Lint', icon: 'checklist', persistent: false, type: 'check' },
      { id: 'build', label: 'Build', icon: 'package', persistent: false, type: 'check' },
      { id: 'dev', label: 'Dev Server', icon: 'play', persistent: true, type: 'service' },
    ]);
    seedPipelines({ default: { steps: ['lint', 'build'], stopOnFailure: true } });
    seedActionState('wt-0', 'lint', { status: 'passed', durationMs: 900, type: 'check' });
    seedActionState('wt-0', 'build', { status: 'passed', durationMs: 4500, type: 'check' });
    seedActionState('wt-0', 'dev', { status: 'running', port: 5173, type: 'service' });

    const component = await mount(
      <Wrapper>
        <ActionBar worktreeId="wt-0" />
      </Wrapper>
    );
    await expect(component).toHaveScreenshot('action-bar-combined.png');
  });
});
