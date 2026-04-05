import { test, expect } from '@playwright/test';

/** Deterministic seeded LCG — keeps mock engine file selection stable across runs */
function seedMathRandom(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    let seed = 0xdeadbeef;
    Math.random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) | 0;
      return (seed >>> 0) / 0x100000000;
    };
  });
}

/** Helper: navigate to inspection mode for wt-0 */
async function enterInspection(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('.bg-canvas').waitFor();
  await page.waitForTimeout(500);

  await page.getByTestId('enter-inspection-wt-0').click();
  await page.locator('.codicon-arrow-left').waitFor();
  await page.waitForTimeout(300);
}

test.describe('Hover tooltips on annotation badges', () => {
  test('list view: hovering error badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Filter to page.tsx which has mock diagnostics (1 error, 1 warning)
    const listPanel = page.getByTestId('file-list-panel');
    await listPanel.locator('input[type="text"]').fill('page');
    await page.waitForTimeout(300);

    // Hover the error badge tooltip trigger
    const errorBadge = listPanel.getByTestId('badge-error').first();
    await expect(errorBadge).toBeVisible({ timeout: 5000 });
    await errorBadge.hover();
    await page.waitForTimeout(200);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('list-error-tooltip.png');
  });

  test('list view: hovering warning badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const listPanel = page.getByTestId('file-list-panel');
    await listPanel.locator('input[type="text"]').fill('page');
    await page.waitForTimeout(300);

    // Hover the warning badge tooltip trigger
    const warningBadge = listPanel.getByTestId('badge-warning').first();
    await expect(warningBadge).toBeVisible({ timeout: 5000 });
    await warningBadge.hover();
    await page.waitForTimeout(200);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('list-warning-tooltip.png');
  });

  test('tree view: hovering error row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const canvas = page.getByTestId('tree-canvas');
    const errorBadge = canvas.getByTestId('badge-error').first();
    await expect(errorBadge).toBeVisible({ timeout: 5000 });
    await errorBadge.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('tree-error-tooltip.png');
  });

  test('tree view: hovering warning row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const canvas = page.getByTestId('tree-canvas');
    const warningBadge = canvas.getByTestId('badge-warning').first();
    await expect(warningBadge).toBeVisible({ timeout: 5000 });
    await warningBadge.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('tree-warning-tooltip.png');
  });
});
