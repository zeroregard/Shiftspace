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

    // Sanity-check a few labels render so a failing screenshot is easy to diagnose.
    await expect(page.getByText('stale', { exact: true })).toBeVisible();
    await expect(page.getByText('in progress', { exact: true })).toBeVisible();
    await expect(page.getByText('in review', { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot('badge-examples.png');
  });

  test('badge appears next to worktree name in the grove', async ({ page }) => {
    await seedMathRandom(page);
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Mock engine preset wt-1 (feature/auth) carries a "stale" badge.
    const staleLabel = page.getByText('stale', { exact: true });
    await expect(staleLabel).toBeVisible();
  });
});
