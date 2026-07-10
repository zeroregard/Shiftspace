import { test, expect } from '@playwright/test';

/** Deterministic seeded LCG — keeps mock engine file selection stable across runs. */
function seedMathRandom(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    let seed = 0xc0ffee;
    Math.random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) | 0;
      return (seed >>> 0) / 0x100000000;
    };
  });
}

test.describe('PR status badges', () => {
  test('renders the CI / conflict / approval / comment cluster on worktree cards', async ({
    page,
  }) => {
    await seedMathRandom(page);
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);

    // Drive a mix of states across the two seeded worktrees so the snapshot
    // exercises every badge variant (passing/failing/running, conflict,
    // approved, unresolved comments).
    await page.evaluate(() => {
      window.__shiftspaceTest?.enablePrStatus('wt-0', {
        number: 100,
        url: '#',
        conflicts: false,
        approved: true,
        unresolvedComments: 0,
        ciStatus: 'passing',
        fetchedAt: 0,
      });
      window.__shiftspaceTest?.enablePrStatus('wt-1', {
        number: 101,
        url: '#',
        conflicts: true,
        approved: false,
        unresolvedComments: 3,
        ciStatus: 'failing',
        fetchedAt: 0,
      });
    });

    await expect(page.getByTestId('pr-status-100')).toBeVisible();
    await expect(page.getByTestId('pr-status-101')).toBeVisible();
    // The failing worktree shows conflict + comment badges.
    await expect(page.getByTestId('pr-badge-conflict')).toBeVisible();
    await expect(page.getByTestId('pr-badge-comments')).toBeVisible();

    await expect(page.locator('.bg-canvas')).toHaveScreenshot('pr-status-cluster.png');
  });

  // Regression: the sidebar ActionsProvider once omitted onOpenExternalUrl, so
  // clicking the PR badges did nothing (the click hit the no-op default). Drive
  // the click through the real webview protocol and assert the open-external-url
  // message is actually posted with the PR's URL.
  test('clicking the PR badge cluster in the sidebar posts open-external-url', async ({ page }) => {
    await seedMathRandom(page);
    await page.goto('/sidebar');
    await page.locator('[data-mode="sidebar"]').waitFor();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      window.__shiftspaceTest?.enablePrStatus('wt-0', {
        number: 100,
        url: 'https://github.com/acme/repo/pull/100',
        conflicts: false,
        approved: true,
        unresolvedComments: 0,
        ciStatus: 'passing',
        fetchedAt: 0,
      });
    });

    const cluster = page.getByTestId('pr-status-100');
    await expect(cluster).toBeVisible();
    await cluster.click();

    const posted = await page.evaluate(() => window.__shiftspaceTest?.getPostedMessages() ?? []);
    expect(posted).toContainEqual({
      type: 'open-external-url',
      url: 'https://github.com/acme/repo/pull/100',
    });
  });
});
