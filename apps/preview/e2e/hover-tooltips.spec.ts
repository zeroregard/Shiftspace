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
  test('list view: hovering an error badge shows tooltip with diagnostic details', async ({
    page,
  }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // The list panel contains AnnotationBadges with error/warning badges.
    // Find the first error badge in the file list and hover it.
    const errorBadge = page.locator('button .codicon-error').first();
    await expect(errorBadge).toBeVisible();
    await errorBadge.hover();

    // Radix tooltip renders content in a portal with role="tooltip"
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('list-error-tooltip.png');
  });

  test('list view: hovering a warning badge shows tooltip with diagnostic details', async ({
    page,
  }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const warningBadge = page.locator('button .codicon-warning').first();
    await expect(warningBadge).toBeVisible();
    await warningBadge.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('list-warning-tooltip.png');
  });

  test('tree view: hovering an error row shows tooltip with diagnostic details', async ({
    page,
  }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // In the tree canvas, FileNode renders annotation rows as plain divs
    // with .codicon-error inside. These are inside the canvas area (not the
    // list panel). Target the canvas container to scope the selector.
    const canvasError = page.locator('[data-testid="tree-canvas"] .codicon-error').first();
    await expect(canvasError).toBeVisible();
    await canvasError.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('tree-error-tooltip.png');
  });

  test('tree view: hovering a warning row shows tooltip with diagnostic details', async ({
    page,
  }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const canvasWarning = page.locator('[data-testid="tree-canvas"] .codicon-warning').first();
    await expect(canvasWarning).toBeVisible();
    await canvasWarning.hover();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page).toHaveScreenshot('tree-warning-tooltip.png');
  });
});
