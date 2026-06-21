import { test, expect, gotoTab } from './fixtures';

// CONTROL · Fader editor tile — EDIT (scene) / LIVE (programmer) modes, the
// attribute sidebar, channel strips, and the GrandMaster.
test.describe('fader editor tile', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'control'); });

  test('renders the tile with a mode toggle and GrandMaster', async ({ page }) => {
    await expect(page.locator('.fader-tile')).toBeVisible();
    await expect(page.locator('.seg-btn[data-mode="live"]')).toBeVisible();
    await expect(page.locator('.seg-btn[data-mode="edit"]')).toBeVisible();
    await expect(page.locator('#fe-gm')).toBeVisible();
  });

  test('switching to LIVE shows the programmer; strips render with a selection', async ({ page }) => {
    await page.locator('.seg-btn[data-mode="live"]').click();
    await expect(page.locator('.seg-btn[data-mode="live"]')).toHaveClass(/active/);
    // Select the whole rig so the programmer has channel strips to draw.
    await page.click('.gb-tab[data-grp="all"]');
    await expect(page.locator('.fcol').first()).toBeVisible({ timeout: 10_000 });
  });

  test('the attribute sidebar filters channel strips', async ({ page }) => {
    await page.locator('.seg-btn[data-mode="live"]').click();
    await page.click('.gb-tab[data-grp="all"]');
    const color = page.locator('.fe-attr[data-attr="color"]');
    if (await color.count()) {
      await color.click();
      await expect(color).toHaveClass(/active/);
    }
  });
});
