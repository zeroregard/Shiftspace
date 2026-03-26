import { test, expect } from '@playwright/test';

test.describe('Graph rendering', () => {
  test('initial state with default worktrees', async ({ page }) => {
    await page.goto('/');
    // Wait for the renderer to mount and layout to stabilize
    await page.locator('.bg-canvas').waitFor();
    // Give layout a moment to settle (tidy-tree computation + initial render)
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('initial-state.webp');
  });

  test('add a worktree', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();

    // Use the control panel to add a worktree
    await page.getByText('+ wt').click();
    // Wait for the new worktree container to render and layout to settle
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('added-worktree.webp');
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

    await expect(page).toHaveScreenshot('agent-activity.webp');
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

    await expect(page).toHaveScreenshot('after-reset.webp');
  });
});
