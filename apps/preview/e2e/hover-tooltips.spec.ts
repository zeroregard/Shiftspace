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
 * Dispatch real PointerEvent + MouseEvent on an element to trigger
 * Radix Tooltip, which listens on onPointerMove.
 */
async function dispatchHover(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator
) {
  await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' as const };
    el.dispatchEvent(new PointerEvent('pointerenter', opts));
    el.dispatchEvent(new PointerEvent('pointermove', opts));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
  });
}

test.describe('Hover tooltips on annotation badges', () => {
  test('list view: hovering error badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // The AnnotationBadges component wraps each Badge in a Radix Tooltip.
    // With asChild, the trigger is the Badge <span> (parent of the icon).
    // Scope to file-list-panel to avoid matching tree canvas icons.
    const listPanel = page.getByTestId('file-list-panel');
    const errorIcon = listPanel.locator('.codicon-error').first();
    await expect(errorIcon).toBeVisible({ timeout: 5000 });

    // Dispatch pointer events on the Badge trigger (parent of icon)
    const trigger = errorIcon.locator('xpath=..');
    await dispatchHover(page, trigger);

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

    const trigger = warningIcon.locator('xpath=..');
    await dispatchHover(page, trigger);

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

    const trigger = errorIcon.locator('xpath=..');
    await dispatchHover(page, trigger);

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

    const trigger = warningIcon.locator('xpath=..');
    await dispatchHover(page, trigger);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('tree-warning-tooltip.png');
  });
});
