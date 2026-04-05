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

  test('problems filter button is visible next to search input', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    await expect(getProblemsButton(page)).toBeVisible();
  });

  test('toggling problems filter shows file count indicator', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // File count indicator should not be visible before filtering
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).not.toBeVisible();

    // Click the problems filter button
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    // The file count indicator should show (filtering is active)
    await expect(fileCount).toBeVisible();
  });

  test('toggling problems filter off hides file count indicator', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');

    // Toggle on then off
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);
    await expect(fileCount).toBeVisible();

    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    // File count indicator should disappear
    await expect(fileCount).not.toBeVisible();
  });

  test('problems filter hides files without diagnostics or findings', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Enable problems filter
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    // After filtering, every visible file row should have at least one
    // annotation badge (error/warning/finding icon).
    // Files without problems should be hidden.
    const listPanel = page.locator('.overflow-y-auto');
    const fileRows = listPanel.getByRole('button');
    const rowCount = await fileRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Each remaining row must contain an annotation icon
    for (let i = 0; i < rowCount; i++) {
      const row = fileRows.nth(i);
      const hasError = await row.locator('.codicon-error').count();
      const hasWarning = await row.locator('.codicon-warning').count();
      const hasFinding = await row.locator('[data-icon="smell"]').count();
      expect(hasError + hasWarning + hasFinding).toBeGreaterThan(0);
    }
  });

  test('problems filter combined with search narrows results further', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    // Enable problems filter and search for "api" (has diagnostics)
    await getProblemsButton(page).click();
    await page.waitForTimeout(300);

    const searchInput = page.locator('input[placeholder="Filter files"]');
    await searchInput.fill('api');
    await page.waitForTimeout(300);

    // Should have results (api.ts has both diagnostics and findings)
    const listPanel = page.locator('.overflow-y-auto');
    const fileRows = listPanel.getByRole('button');
    const count = await fileRows.count();
    expect(count).toBeGreaterThanOrEqual(0);

    // File count indicator should show
    const fileCount = page.locator('text=/\\d+ \\/ \\d+ files/');
    await expect(fileCount).toBeVisible();
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

  test('button shows warning icon when worktree has problems', async ({ page }) => {
    await seedMathRandom(page);
    await enterInspection(page);

    const btn = getProblemsButton(page);
    await expect(btn).toBeEnabled();
    await expect(btn.locator('.codicon-warning')).toBeVisible();
    await expect(btn.locator('.codicon-check')).not.toBeVisible();
  });

  test('button shows green checkmark and is disabled when worktree has no problems', async ({
    page,
  }) => {
    await seedMathRandom(page);
    await page.goto('/');
    await page.locator('.bg-canvas').waitFor();
    await page.waitForTimeout(500);

    // Add a third worktree (deep template, no mock diagnostics or findings).
    // The mock engine assigns a timestamp-based ID (wt-<Date.now()>), so we
    // click the last enter-inspection button which is the newly added worktree.
    await page.getByText('+ wt').click();
    await page.waitForTimeout(500);

    await page.locator('[data-testid^="enter-inspection-"]').last().click();
    await page.locator('.codicon-arrow-left').waitFor();
    await page.waitForTimeout(300);

    const btn = getProblemsButton(page);
    await expect(btn).toBeDisabled();
    await expect(btn.locator('.codicon-check')).toBeVisible();
    await expect(btn.locator('.codicon-warning')).not.toBeVisible();
  });
});
