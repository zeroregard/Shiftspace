import { test, expect } from '@playwright/test';

test.describe('Sidebar view', () => {
  test('renders slim worktree cards', async ({ page }) => {
    await page.goto('/sidebar');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('sidebar-initial.png');
  });
});
