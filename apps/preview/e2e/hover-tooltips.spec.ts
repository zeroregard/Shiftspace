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

    const errorIcon = listPanel.locator('.codicon-error').first();
    await expect(errorIcon).toBeVisible({ timeout: 5000 });

    // Click away from the search input first, then hover the badge trigger
    await page.mouse.click(1, 1);
    await page.waitForTimeout(100);

    // Hover the Badge (parent of icon) — the Radix Tooltip trigger
    const trigger = errorIcon.locator('xpath=..');
    await trigger.hover();
    await page.waitForTimeout(500);

    // Take screenshot to see the state after hover, before asserting tooltip
    await expect(page).toHaveScreenshot('list-after-error-hover.png');

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

    const warningIcon = listPanel.locator('.codicon-warning').first();
    await expect(warningIcon).toBeVisible({ timeout: 5000 });

    await page.mouse.click(1, 1);
    await page.waitForTimeout(100);

    const trigger = warningIcon.locator('xpath=..');
    await trigger.hover();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('list-after-warning-hover.png');

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('list-warning-tooltip.png');
  });

  test('tree view: hovering error row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const canvas = page.getByTestId('tree-canvas');
    const errorIcon = canvas.locator('.codicon-error').first();
    await expect(errorIcon).toBeVisible({ timeout: 5000 });
    await errorIcon.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('tree-error-tooltip.png');
  });

  test('tree view: hovering warning row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const canvas = page.getByTestId('tree-canvas');
    const warningIcon = canvas.locator('.codicon-warning').first();
    await expect(warningIcon).toBeVisible({ timeout: 5000 });
    await warningIcon.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('tree-warning-tooltip.png');
  });
});
