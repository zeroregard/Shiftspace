import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __shiftspaceTest?: {
      enablePlanPath: (worktreeId: string, planPath?: string, planContent?: string) => void;
      disablePlanPath: (worktreeId: string) => void;
      enableBadgeDescription: (worktreeId: string, description: string) => void;
    };
  }
}

test.describe('Control panel', () => {
  test('control panel is visible', async ({ page }) => {
    await page.goto('/');

    // The control panel should be visible with its key buttons
    await expect(page.getByText('+ wt')).toBeVisible();
    await expect(page.getByText('↻ reset')).toBeVisible();
  });

  test('pause and resume simulation', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();

    // Start an agent
    await page.getByText('feature').first().click();
    await page.waitForTimeout(500);

    // Pause
    await page.getByText('⏸ pause').click();
    await expect(page.getByText('▶ resume')).toBeVisible();

    // Resume
    await page.getByText('▶ resume').click();
    await expect(page.getByText('⏸ pause')).toBeVisible();
  });

  test('remove worktree', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();

    // Add a worktree first
    await page.getByText('+ wt').click();
    await page.waitForTimeout(300);

    // Remove the last worktree using the ✕ button
    await page.getByText('✕').last().click();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('worktree-removed.png');
  });

  test('trash button shows inline confirm popover', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Hover to reveal group-visible buttons, then click trash on wt-1
    await page.getByTestId('remove-worktree-wt-1').hover();
    await page.getByTestId('remove-worktree-wt-1').click();
    await page.waitForTimeout(200);

    await expect(page).toHaveScreenshot('delete-popover-open.png');
  });

  test('trash popover dismisses on escape without removing', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Open delete popover on wt-1
    await page.getByTestId('remove-worktree-wt-1').hover();
    await page.getByTestId('remove-worktree-wt-1').click();
    await page.waitForTimeout(200);

    // Press Escape — worktree should remain
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('delete-popover-cancelled.png');
  });

  test('plan button toggles with the planPath feature', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);

    // Default seed: neither worktree has a planPath — the feature is opt-in.
    await expect(page.getByTestId('plan-button-wt-0')).toHaveCount(0);
    await expect(page.getByTestId('plan-button-wt-1')).toHaveCount(0);

    // Enable plan on wt-1 via the test hook (no UI surface — keeps the
    // control panel pixel-stable so existing baselines don't drift).
    await page.evaluate(() => window.__shiftspaceTest?.enablePlanPath('wt-1'));
    await expect(page.getByTestId('plan-button-wt-1')).toBeVisible();

    // Baseline: wt-1 card shows the Plan icon button next to the badge.
    await expect(page).toHaveScreenshot('plan-button-and-badge-visible.png');

    // Disable again — the button disappears.
    await page.evaluate(() => window.__shiftspaceTest?.disablePlanPath('wt-1'));
    await expect(page.getByTestId('plan-button-wt-1')).toHaveCount(0);
  });

  test('badge description appears in a tooltip on hover', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);

    await page.evaluate(() =>
      window.__shiftspaceTest?.enableBadgeDescription(
        'wt-1',
        'Last touched 3 weeks ago; needs a rebase.'
      )
    );

    const badge = page.getByTestId('worktree-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await badge.hover();
    // Tooltip uses delayDuration=200ms — pad so the open animation settles.
    await page.waitForTimeout(400);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(tooltip).toContainText('Last touched 3 weeks ago');

    await expect(page).toHaveScreenshot('badge-description-tooltip.png');
  });

  test('shift-hover on the plan button shows the plan preview', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);

    await page.evaluate(() => window.__shiftspaceTest?.enablePlanPath('wt-1'));

    const planBtn = page.getByTestId('plan-button-wt-1');
    await expect(planBtn).toBeVisible({ timeout: 5000 });

    // Hold Shift BEFORE hovering — that way the first mousemove into the
    // button has `shiftKey=true`, which satisfies both branches of the
    // shift+hover gate in one step and avoids a race between the key event
    // and the hover state update.
    await page.keyboard.down('Shift');
    await planBtn.hover();
    await page.waitForTimeout(200);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    // Matches the preview content seeded by the test hook's default.
    await expect(tooltip).toContainText('Representative preview content');

    await expect(page).toHaveScreenshot('plan-preview-tooltip.png');

    await page.keyboard.up('Shift');
  });
});
