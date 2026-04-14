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

test.describe('WorktreeBadge', () => {
  test('renders variants on /badge-examples', async ({ page }) => {
    await seedMathRandom(page);
    await page.goto('/badge-examples');
    await page.getByTestId('badge-examples-root').waitFor();

    // Sanity-check a few rows render so a failing screenshot is easy to diagnose.
    // Each row is keyed by its title testid; the badge label inside it is a
    // separate element, so this avoids strict-mode ambiguity with duplicate text.
    await expect(page.getByTestId('badge-row-neutral')).toBeVisible();
    await expect(page.getByTestId('badge-row-info')).toBeVisible();
    await expect(page.getByTestId('badge-row-warning')).toBeVisible();

    await expect(page).toHaveScreenshot('badge-examples.png');
  });
});
