import { test, expect } from '@playwright/test';

/** Enter inspection mode for the given worktree. */
async function enterInspection(page: import('@playwright/test').Page, worktreeId: string) {
  await page.goto('/');
  await page.locator('.bg-canvas').waitFor();
  await page.waitForTimeout(500);

  await page.getByTestId(`enter-inspection-${worktreeId}`).click();
  await page.locator('.codicon-arrow-left').waitFor();
  await page.waitForTimeout(300);
}

test.describe('Diff-mode picker', () => {
  // wt-1 is on `feature/auth` — a non-default branch, so the default branch
  // is offered as its own option in the picker.
  const FEATURE_WT = 'wt-1';

  test('a feature worktree opens on working changes, not a branch comparison', async ({ page }) => {
    await enterInspection(page, FEATURE_WT);

    await expect(page.getByTestId('diff-mode-picker')).toHaveText('Working changes');
  });

  test('default branch is offered alongside working changes and all files', async ({ page }) => {
    await enterInspection(page, FEATURE_WT);
    await page.getByTestId('diff-mode-picker').click();

    const defaultOption = page.getByTestId('diff-mode-default-branch');
    await expect(defaultOption).toBeVisible();
    // Bare branch name plus the "default" pill — no "vs " prefix in the list.
    await expect(defaultOption).toContainText('main');
    await expect(defaultOption).toContainText('default');
    await expect(page.getByTestId('diff-mode-working')).toBeVisible();
    await expect(page.getByTestId('diff-mode-repo')).toBeVisible();
  });

  test('picking the default branch switches the selector to "vs main"', async ({ page }) => {
    await enterInspection(page, FEATURE_WT);
    await page.getByTestId('diff-mode-picker').click();
    await page.getByTestId('diff-mode-default-branch').click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId('diff-mode-picker')).toHaveText('vs main');
  });

  test('screenshot: open picker showing the default-branch pill', async ({ page }) => {
    await enterInspection(page, FEATURE_WT);
    await page.getByTestId('diff-mode-picker').click();
    await expect(page.getByTestId('diff-mode-default-branch')).toBeVisible();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('diff-mode-picker-open.png');
  });
});
