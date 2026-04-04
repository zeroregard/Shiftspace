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

/**
 * Hover an element using dispatchEvent to guarantee pointer events fire
 * on the correct target regardless of layering or transforms.
 */
async function triggerHover(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator
) {
  // Move mouse away first so that entering the element fires pointerenter
  await page.mouse.move(0, 0);
  await page.waitForTimeout(50);

  const box = await locator.boundingBox();
  if (!box) throw new Error('Element not found or has no bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
}

test.describe('Hover tooltips on annotation badges', () => {
  test('list view: hovering error badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const listPanel = page.getByTestId('file-list-panel');
    const errorIcon = listPanel.locator('.codicon-error').first();
    await expect(errorIcon).toBeVisible({ timeout: 5000 });

    // Move mouse to the error badge to trigger Radix tooltip
    await triggerHover(page, errorIcon);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('list-error-tooltip.png');
  });

  test('list view: hovering warning badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const listPanel = page.getByTestId('file-list-panel');
    const warningIcon = listPanel.locator('.codicon-warning').first();
    await expect(warningIcon).toBeVisible({ timeout: 5000 });

    await triggerHover(page, warningIcon);

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

    await triggerHover(page, errorIcon);

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

    await triggerHover(page, warningIcon);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('tree-warning-tooltip.png');
  });
});
