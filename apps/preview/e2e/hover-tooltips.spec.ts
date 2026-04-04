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
  test('list view: hovering an error badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Scope to file-list-panel so we don't accidentally match tree canvas icons
    const listPanel = page.getByTestId('file-list-panel');
    const errorBadge = listPanel.locator('.codicon-error').first().locator('..');
    await expect(errorBadge).toBeVisible();
    await errorBadge.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    await expect(page).toHaveScreenshot('list-error-tooltip.png');
  });

  test('list view: hovering a warning badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const listPanel = page.getByTestId('file-list-panel');
    const warningBadge = listPanel.locator('.codicon-warning').first().locator('..');
    await expect(warningBadge).toBeVisible();
    await warningBadge.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    await expect(page).toHaveScreenshot('list-warning-tooltip.png');
  });

  test('tree view: hovering an error row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Scope to tree-canvas. The annotation row div (Tooltip trigger) is the
    // parent of the codicon icon element.
    const canvas = page.getByTestId('tree-canvas');
    const errorRow = canvas.locator('.codicon-error').first().locator('..');
    await expect(errorRow).toBeVisible();
    await errorRow.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    await expect(page).toHaveScreenshot('tree-error-tooltip.png');
  });

  test('tree view: hovering a warning row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const canvas = page.getByTestId('tree-canvas');
    const warningRow = canvas.locator('.codicon-warning').first().locator('..');
    await expect(warningRow).toBeVisible();
    await warningRow.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    await expect(page).toHaveScreenshot('tree-warning-tooltip.png');
  });
});
