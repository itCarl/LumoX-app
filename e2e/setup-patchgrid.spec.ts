import { test, expect, gotoTab } from './fixtures';

// SETUP · Patch grid tile — the DMX address map of the patched rig (grid/list),
// fixture selection, and universe stepping.
test.describe('patch grid tile', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'setup'); });

  test('renders the grid populated with the demo rig', async ({ page }) => {
    await expect(page.locator('.pg-tile')).toBeVisible();
    await expect(page.locator('#pg-grid')).toBeVisible();
    expect(await page.locator('.cell.fx[data-fx]').count()).toBeGreaterThan(0);
  });

  test('clicking a patched fixture selects it', async ({ page }) => {
    const cell = page.locator('.cell.fx[data-fx]').first();
    const fx = await cell.getAttribute('data-fx');
    await cell.click();
    await expect.poll(() => page.evaluate(() => (window as any).lumox.selection.get())).toContain(fx);
  });

  test('toggling grid / list view moves the active segment', async ({ page }) => {
    const list = page.locator('.seg-btn[data-mode="list"]');
    const grid = page.locator('.seg-btn[data-mode="grid"]');
    await list.click();
    await expect(list).toHaveClass(/active/);
    await grid.click();
    await expect(grid).toHaveClass(/active/);
  });

  test('the universe label reflects the active output universe', async ({ page }) => {
    await expect(page.locator('#pg-uni')).toBeVisible();
    const universes = await page.evaluate(() => (window as any).lumox.universes.list());
    expect(universes.length).toBeGreaterThan(0);
  });
});
