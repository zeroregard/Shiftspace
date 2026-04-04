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

    // The error badge is inside a Tooltip trigger <span> wrapping <Badge>
    const errorIcon = listPanel.locator('.codicon-error').first();
    await expect(errorIcon).toBeVisible({ timeout: 5000 });

    // Hover the icon — pointerenter propagates to the Radix Tooltip trigger ancestor
    await errorIcon.hover();
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

    const warningIcon = listPanel.locator('.codicon-warning').first();
    await expect(warningIcon).toBeVisible({ timeout: 5000 });

    // Hover the warning icon directly — Radix Tooltip triggers on any hover
    // within the trigger subtree, so we don't need to navigate to the parent.
    await warningIcon.hover();
    await page.waitForTimeout(200);

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
