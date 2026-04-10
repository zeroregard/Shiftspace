import { test, expect } from '@playwright/test';

test.describe('Tree sorting — grove view', () => {
  test('sort by last updated', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Open sort picker and select "Last updated"
    await page.getByTestId('sort-worktrees').click();
    await page.getByTestId('sort-last-updated').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('grove-sort-last-updated.png');
  });

  test('sort by branch name', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Open sort picker and select "Branch (A–Z)"
    await page.getByTestId('sort-worktrees').click();
    await page.getByTestId('sort-branch').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('grove-sort-branch.png');
  });
});

test.describe('Tree sorting — sidebar view', () => {
  test('sort by last updated', async ({ page }) => {
    await page.goto('/sidebar');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Open sort picker and select "Last updated"
    await page.getByTestId('sort-worktrees').click();
    await page.getByTestId('sort-last-updated').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('sidebar-sort-last-updated.png');
  });

  test('sort by branch name', async ({ page }) => {
    await page.goto('/sidebar');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Open sort picker and select "Branch (A–Z)"
    await page.getByTestId('sort-worktrees').click();
    await page.getByTestId('sort-branch').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('sidebar-sort-branch.png');
  });
});
