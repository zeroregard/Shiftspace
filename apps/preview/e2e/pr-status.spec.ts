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
    // Every card with a PR shows a clickable open-PR pill carrying the number.
    await expect(page.getByTestId('pr-open-100')).toBeVisible();
    await expect(page.getByTestId('pr-open-101')).toBeVisible();
    // The failing worktree shows conflict + comment badges.
    await expect(page.getByTestId('pr-badge-conflict')).toBeVisible();
    await expect(page.getByTestId('pr-badge-comments')).toBeVisible();

    await expect(page.locator('.bg-canvas')).toHaveScreenshot('pr-status-cluster.png');
  });

  test('always shows a clickable open-PR pill, even with no status signals', async ({ page }) => {
    await seedMathRandom(page);
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(300);

    // A brand-new PR: mergeable, no CI, no reviews, no comments. Every status
    // badge is suppressed, but the open-PR pill must still be present so the
    // worktree has a visible way to reach its PR.
    await page.evaluate(() => {
      window.__shiftspaceTest?.enablePrStatus('wt-0', {
        number: 200,
        url: '#',
        conflicts: false,
        approved: false,
        unresolvedComments: 0,
        ciStatus: 'none',
        fetchedAt: 0,
      });
    });

    await expect(page.getByTestId('pr-open-200')).toBeVisible();
    // No status badges render for a signal-less PR.
    await expect(page.getByTestId('pr-badge-conflict')).toHaveCount(0);
    await expect(page.getByTestId('pr-badge-approved')).toHaveCount(0);
    await expect(page.getByTestId('pr-badge-comments')).toHaveCount(0);
  });
});
