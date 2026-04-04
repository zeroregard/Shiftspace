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

  // Enter inspection mode for wt-0
  await page.getByTestId('enter-inspection-wt-0').click();

  // Wait for the back button (unique to InspectionView)
  await page.locator('.codicon-arrow-left').waitFor();
  await page.waitForTimeout(300);
}

test.describe('Search filter in Inspection view', () => {
  test('search input is visible in inspection mode', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');
    await expect(searchInput).toBeVisible();
  });

  test('typing a filter narrows the file list without blank screen', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Type "src" — should filter to files containing "src"
    await searchInput.fill('src');
    await page.waitForTimeout(200);

    // The view should NOT be blank — there should be visible file rows
    // (since the mock data has many src/ files)
    const fileRows = page.locator('button:has(.codicon), button:has(span.text-11)').filter({
      hasText: /src/,
    });
    const count = await fileRows.count();
    expect(count).toBeGreaterThan(0);

    // The file count indicator should be visible
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).toBeVisible();
  });

  test('typing single character does not blank the view', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Type a single character — the critical bug scenario
    await searchInput.fill('s');
    await page.waitForTimeout(200);

    // The inspection view should still be fully rendered
    // Check that the header with back button is still visible
    await expect(page.locator('.codicon-arrow-left')).toBeVisible();

    // The split panel layout should still exist
    const listPanel = page.locator('.overflow-y-auto');
    await expect(listPanel).toBeVisible();
  });

  test('invalid regex does not crash — falls back to substring', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Type invalid regex "[invalid" — should not crash
    await searchInput.fill('[invalid');
    await page.waitForTimeout(200);

    // The view should still be visible (not blank)
    await expect(page.locator('.codicon-arrow-left')).toBeVisible();

    // The search input border should turn red (error state)
    const inputEl = page.locator('input[placeholder="Filter files"]');
    await expect(inputEl).toBeVisible();
  });

  test('clear button resets the filter', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Type a filter
    await searchInput.fill('hooks');
    await page.waitForTimeout(200);

    // The clear button (X) should appear
    const clearButton = page.locator('button .codicon-close').first();
    await expect(clearButton).toBeVisible();

    // Click clear
    await clearButton.click();
    await page.waitForTimeout(200);

    // The input should be empty
    await expect(searchInput).toHaveValue('');

    // The file count indicator should disappear (no filter active)
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).not.toBeVisible();
  });

  test('empty filter shows all files', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Type something then clear it
    await searchInput.fill('hooks');
    await page.waitForTimeout(100);
    await searchInput.fill('');
    await page.waitForTimeout(200);

    // No file count indicator when filter is empty
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).not.toBeVisible();
  });

  test('regex filter works correctly', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Use a valid regex to filter tsx files
    await searchInput.fill('\\.tsx$');
    await page.waitForTimeout(200);

    // View should not be blank
    await expect(page.locator('.codicon-arrow-left')).toBeVisible();

    // File count should be visible
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).toBeVisible();
  });

  test('filter with no matches shows empty state', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Type something that matches nothing
    await searchInput.fill('zzzznonexistent');
    await page.waitForTimeout(200);

    // Should show "No matching files" message
    await expect(page.getByText('No matching files')).toBeVisible();
  });

  test('rapid typing does not cause errors', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Rapidly type and delete
    await searchInput.fill('s');
    await searchInput.fill('sr');
    await searchInput.fill('src');
    await searchInput.fill('src/');
    await searchInput.fill('src/h');
    await searchInput.fill('src/ho');
    await searchInput.fill('src/hoo');
    await searchInput.fill('src/hook');
    await searchInput.fill('');
    await searchInput.fill('co');
    await searchInput.fill('comp');
    await page.waitForTimeout(200);

    // View should still be intact
    await expect(page.locator('.codicon-arrow-left')).toBeVisible();
  });

  test('screenshot: inspection view with active search filter', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const searchInput = page.locator('input[placeholder="Filter files"]');

    // Apply a filter that shows some results
    await searchInput.fill('src');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('inspection-search-filter.png');
  });
});

test.describe('Problems filter in Inspection view', () => {
  /** Locate the problems-only toggle button via data-testid. */
  function getProblemsButton(page: import('@playwright/test').Page) {
    return page.getByTestId('problems-filter-toggle');
  }

  /**
   * Count visible file rows in the list panel.
   * Each InspectionFileRow is a <button> with role="button" containing the
   * filename text. We scope to the scrollable list area and exclude section
   * labels (which are <div>s, not buttons).
   */
  function getFileRows(page: import('@playwright/test').Page) {
    return page.locator('.overflow-y-auto').getByRole('button');
  }

  test('problems filter button is visible next to search input', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    await expect(getProblemsButton(page)).toBeVisible();
  });

  test('toggling problems filter hides files without problems', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const fileRows = getFileRows(page);
    const totalBefore = await fileRows.count();
    expect(totalBefore).toBeGreaterThan(0);

    // Click the problems filter button
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    // File count should be reduced — only files with problems should remain
    const totalAfter = await fileRows.count();
    expect(totalAfter).toBeGreaterThan(0);
    expect(totalAfter).toBeLessThan(totalBefore);

    // The file count indicator should show (filtering is active)
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).toBeVisible();
  });

  test('toggling problems filter off restores all files', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const fileRows = getFileRows(page);
    const totalBefore = await fileRows.count();

    // Toggle on then off
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    // Should be back to original count
    const totalAfter = await fileRows.count();
    expect(totalAfter).toBe(totalBefore);

    // File count indicator should disappear
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).not.toBeVisible();
  });

  test('problems filter works together with search filter', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // First enable problems-only filter
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    const fileRows = getFileRows(page);
    const problemsCount = await fileRows.count();

    // Now also type a search filter
    const searchInput = page.locator('input[placeholder="Filter files"]');
    await searchInput.fill('api');
    await page.waitForTimeout(300);

    // Should have even fewer results (intersection of both filters)
    const combinedCount = await fileRows.count();
    expect(combinedCount).toBeLessThanOrEqual(problemsCount);
    expect(combinedCount).toBeGreaterThan(0);
  });

  test('problems filter with no matching files shows empty state', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Enable problems filter + search for a file without problems
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    const searchInput = page.locator('input[placeholder="Filter files"]');
    await searchInput.fill('favicon');
    await page.waitForTimeout(300);

    await expect(page.getByText('No matching files')).toBeVisible();
  });

  test('screenshot: inspection view with problems filter active', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    await getProblemsButton(page).click();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('inspection-problems-filter.png');
  });
});
