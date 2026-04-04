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
 * Move the real mouse pointer over the centre of a locator.
 * Unlike locator.hover({ force }), page.mouse.move dispatches genuine
 * pointer/mouse events that Radix Tooltip listens on.
 */
async function hoverCenter(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('Hover tooltips on annotation badges', () => {
  test('list view: hovering an error badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // In the list panel, AnnotationBadges wraps each Badge (span) in a
    // Radix Tooltip trigger. The Badge span is the parent of the codicon icon.
    const errorBadge = page.locator('button .codicon-error').first().locator('..');
    await expect(errorBadge).toBeVisible();
    await hoverCenter(page, errorBadge);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('list-error-tooltip.png');
  });

  test('list view: hovering a warning badge shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const warningBadge = page.locator('button .codicon-warning').first().locator('..');
    await expect(warningBadge).toBeVisible();
    await hoverCenter(page, warningBadge);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('list-warning-tooltip.png');
  });

  test('tree view: hovering an error row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // In the tree canvas, each annotation row div is a Tooltip trigger.
    // The row div is the parent (..) of the codicon icon.
    const canvasErrorRow = page
      .locator('[data-testid="tree-canvas"] .codicon-error')
      .first()
      .locator('..');
    await expect(canvasErrorRow).toBeVisible();
    await hoverCenter(page, canvasErrorRow);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('tree-error-tooltip.png');
  });

  test('tree view: hovering a warning row shows tooltip', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const canvasWarningRow = page
      .locator('[data-testid="tree-canvas"] .codicon-warning')
      .first()
      .locator('..');
    await expect(canvasWarningRow).toBeVisible();
    await hoverCenter(page, canvasWarningRow);

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('tree-warning-tooltip.png');
  });
});
