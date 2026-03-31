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

test.describe('Inspector list view — file categories', () => {
  // The mock engine always seeds `src/app/page.tsx` as a partially staged file
  // (staged: true, partiallyStaged: true) for wt-0/nextjs worktrees. This
  // verifies that the same file correctly appears under BOTH the "Staged" and
  // "Unstaged" section headers in the Inspector list panel.
  const PARTIAL_FILE = 'page.tsx'; // filename portion shown in each row

  test('partially staged file appears in both Staged and Unstaged sections', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Both section labels must be present
    await expect(page.getByText('Staged', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Unstaged', { exact: true }).first()).toBeVisible();

    // The partially staged file must appear at least twice — once per section
    const rows = page.getByRole('button').filter({ hasText: PARTIAL_FILE });
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('screenshot: partially staged file shown in both sections', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Wait for both sections to render
    await expect(page.getByText('Staged', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Unstaged', { exact: true }).first()).toBeVisible();

    await expect(page).toHaveScreenshot('inspector-partial-staging.png');
  });
});
