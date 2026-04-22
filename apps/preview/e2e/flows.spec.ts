/**
 * Integration-style flow tests.
 *
 * Unlike the rest of the E2E suite these specs are **not** screenshot-based.
 * They assert that a UI trigger produces the full round-trip through the
 * webview protocol: renderer callback → MessageRouter → MockGitProvider →
 * store update → UI reflection.
 *
 * The provider exposes `window.__shiftspaceTest` so each test can:
 *   - read the log of calls the router delivered (`getCalls`)
 *   - force a one-shot failure for a flow (`failNextOp`)
 *   - inspect posted messages (`getPostedMessages`)
 *
 * Rule of thumb: every flow that can regress silently (like the PR #131
 * deletion bug that slipped past the screenshot suite) gets a test here.
 */
import { test, expect, type Page } from '@playwright/test';

interface TestHook {
  failNextOp: (op: string) => void;
  getCalls: () => Array<{ op: string; args: unknown[] }>;
  getPostedMessages: () => Array<Record<string, unknown>>;
  clearCalls: () => void;
}

declare global {
  interface Window {
    __shiftspaceTest?: TestHook;
  }
}

async function clearCalls(page: Page) {
  await page.evaluate(() => window.__shiftspaceTest?.clearCalls());
}

async function getCalls(page: Page) {
  return page.evaluate(() => window.__shiftspaceTest?.getCalls() ?? []);
}

async function getPostedMessages(page: Page) {
  return page.evaluate(() => window.__shiftspaceTest?.getPostedMessages() ?? []);
}

async function openRemovePopover(page: Page, worktreeId: string) {
  const trigger = page.getByTestId(`remove-worktree-${worktreeId}`);
  await trigger.hover();
  await trigger.click();
}

test.describe('Flows – round-trip message routing', () => {
  test('remove worktree: UI → remove-worktree message → provider → store clears the card', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);
    await clearCalls(page);

    // Open the popover and confirm
    await openRemovePopover(page, 'wt-1');
    await page.getByRole('button', { name: /^confirm$/i }).click();

    // Assert the message actually went through the bridge/router
    await expect
      .poll(() => getPostedMessages(page))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'remove-worktree', worktreeId: 'wt-1' }),
        ])
      );

    // Provider handler saw the call
    await expect
      .poll(() => getCalls(page))
      .toEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'remove-worktree', args: ['wt-1'] })])
      );

    // Card eventually disappears (engine emits worktree-removed after ~250ms)
    await expect(page.getByTestId('remove-worktree-wt-1')).toHaveCount(0, { timeout: 2000 });
  });

  test('remove worktree: failure leaves the worktree in place', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);
    await clearCalls(page);

    // Arm a one-shot failure so the mock provider emits pending → failed
    await page.evaluate(() => window.__shiftspaceTest?.failNextOp('remove-worktree'));

    await openRemovePopover(page, 'wt-1');
    await page.getByRole('button', { name: /^confirm$/i }).click();

    // Provider call happened
    await expect
      .poll(() => getCalls(page))
      .toEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'remove-worktree', args: ['wt-1'] })])
      );

    // Card is still present after enough time for a success path to have
    // deleted it — the failure recovery keeps the worktree.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('remove-worktree-wt-1')).toHaveCount(1);
  });

  test('add worktree via in-grove plus button routes through add-worktree message', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);
    await clearCalls(page);

    await page.getByTestId('add-worktree').click();

    await expect
      .poll(() => getPostedMessages(page))
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'add-worktree' })]));

    await expect
      .poll(() => getCalls(page))
      .toEqual(expect.arrayContaining([expect.objectContaining({ op: 'add-worktree' })]));
  });

  test('plan button click posts file-click with the worktree planPath', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);
    await clearCalls(page);

    await page.getByTestId('plan-button-wt-1').click();

    await expect
      .poll(() => getPostedMessages(page))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'file-click',
            worktreeId: 'wt-1',
            filePath: 'PLAN.md',
          }),
        ])
      );

    await expect
      .poll(() => getCalls(page))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ op: 'file-click', args: ['wt-1', 'PLAN.md', undefined] }),
        ])
      );
  });

  test('shift-hovering the plan button triggers load-plan-content once', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);
    await clearCalls(page);

    const btn = page.getByTestId('plan-button-wt-1');
    await page.keyboard.down('Shift');
    await btn.hover();
    // Wait long enough for the load request + store update
    await page.waitForTimeout(150);

    await expect
      .poll(() => getCalls(page))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ op: 'load-plan-content', args: ['wt-1'] }),
        ])
      );

    // Re-hover — cache should prevent a second request
    await page.mouse.move(10, 10);
    await btn.hover();
    await page.waitForTimeout(100);
    await page.keyboard.up('Shift');

    const calls = await getCalls(page);
    const loadCalls = calls.filter((c) => c.op === 'load-plan-content');
    expect(loadCalls).toHaveLength(1);
  });

  test('control panel remove button also routes through the bridge', async ({ page }) => {
    // The control panel's ✕ button is a second UI surface for removal.
    // Catching it here ensures app.tsx's `handleRemoveWorktree` wiring stays
    // consistent with what the in-grove trash button does.
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);
    await clearCalls(page);

    // Use the last ✕ in the control panel (removes the last worktree).
    await page.getByText('✕').last().click();

    await expect
      .poll(() => getPostedMessages(page))
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'remove-worktree' })]));

    await expect
      .poll(() => getCalls(page))
      .toEqual(expect.arrayContaining([expect.objectContaining({ op: 'remove-worktree' })]));
  });
});
