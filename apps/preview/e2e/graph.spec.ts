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

test.describe('Graph rendering', () => {
  test('initial state with default worktrees', async ({ page }) => {
    await page.goto('/');
    // Wait for the renderer to mount and layout to stabilize
    await page.locator('.bg-canvas').waitFor();
    // Give layout a moment to settle (tidy-tree computation + initial render)
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('initial-state.png');
  });

  test('add a worktree', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();

    // Use the control panel to add a worktree
    await page.getByText('+ wt').click();
    // Wait for the new worktree container to render and layout to settle
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('added-worktree.png');
  });

  test('agent activity generates file nodes', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();

    // Start a "feature" agent on the first worktree
    await page.getByText('feature').first().click();
    // Let the agent produce a few file changes
    await page.waitForTimeout(2000);
    // Pause to freeze the state for a stable screenshot
    await page.getByText('⏸ pause').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('agent-activity.png');
  });

  test('reset clears all state', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();

    // Add a worktree and start an agent
    await page.getByText('+ wt').click();
    await page.getByText('feature').first().click();
    await page.waitForTimeout(1000);

    // Reset
    await page.getByText('↻ reset').click();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('after-reset.png');
  });

  test('inspection mode shows insight smell pills', async ({ page }) => {
    await seedMathRandom(page);
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Enter inspection mode for wt-0 via its data-testid.
    await page.getByTestId('enter-inspection-wt-0').click();

    // Wait for the back button that is unique to the InspectionView header.
    // It is always rendered, making it the most reliable signal that
    // inspection mode is active.
    await page.locator('.codicon-arrow-left').waitFor();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('inspection-insight-pills.png');
  });
});
