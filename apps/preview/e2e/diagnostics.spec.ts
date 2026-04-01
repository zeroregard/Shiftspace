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

test.describe('Diagnostics insight pills', () => {
  test('diagnostic pills visible on file nodes in inspection mode', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Mock data seeds diagnostics for src/app/page.tsx (1 error, 1 warning)
    // and src/hooks/useAuth.ts (2 errors). Verify error/warning pills are rendered.
    const errorPills = page.locator('text=❌');
    const warningPills = page.locator('text=⚠');

    // We should see at least one error pill and one warning pill from mock data
    await expect(errorPills.first()).toBeVisible();
    await expect(warningPills.first()).toBeVisible();

    await expect(page).toHaveScreenshot('inspection-diagnostic-pills.png');
  });
});
