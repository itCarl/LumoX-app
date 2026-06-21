import { test, expect, gotoTab } from './fixtures';

// SETUP · Fixture library tile — vendor accordions (lazy-loaded), search, and the
// fixture detail/patch form.
test.describe('library tile', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'setup'); });

  test('renders the tile with vendor accordions and a fixture count', async ({ page }) => {
    await expect(page.locator('.lib-tile')).toBeVisible();
    await expect(page.locator('.acc-head').first()).toBeVisible();
    expect(await page.locator('.acc-head').count()).toBeGreaterThan(1);
    await expect(page.locator('#lib-count')).toBeVisible();
  });

  test('expanding a vendor accordion reveals fixture tree items', async ({ page }) => {
    expect(await page.locator('.tree-item').count()).toBe(0);
    await page.locator('.acc-head').first().click();
    await expect(page.locator('.tree-item').first()).toBeVisible({ timeout: 15_000 });
  });

  test('selecting a fixture opens the detail / patch form', async ({ page }) => {
    await page.locator('.acc-head').first().click();
    const item = page.locator('.tree-item').first();
    await item.click();
    await expect(item).toHaveClass(/sel/);
    await expect(page.locator('#lib-detail')).toBeVisible();
    await expect(page.locator('#ld-patch')).toBeVisible();
  });

  test('the search box filters the library', async ({ page }) => {
    const search = page.locator('.lib-search input');
    await search.fill('par');
    // Search forces a full load and shows matching tree items.
    await expect(page.locator('.tree-item').first()).toBeVisible({ timeout: 15_000 });
    const filtered = await page.locator('.tree-item').count();
    expect(filtered).toBeGreaterThan(0);

    await search.fill('zzzznomatchzzzz');
    await expect(page.locator('.tree-item')).toHaveCount(0);
  });
});
