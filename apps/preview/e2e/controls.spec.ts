import { test, expect } from '@playwright/test';

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
});
