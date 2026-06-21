import { test, expect, gotoTab } from './fixtures';

// SETUP · Stage tile — the 2D rig layout: fixture nodes, selection (single +
// ordered index badges), tool rail, and zoom.
test.describe('stage tile', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'setup'); });

  test('renders one node per patched fixture', async ({ page }) => {
    await expect(page.locator('.stage-tile')).toBeVisible();
    await expect(page.locator('.st-node[data-fx]')).toHaveCount(24);
  });

  test('clicking a node selects exactly that fixture', async ({ page }) => {
    const node = page.locator('.st-node[data-fx]').first();
    const fx = await node.getAttribute('data-fx');
    await node.click();
    await expect(node).toHaveClass(/sel/);
    await expect.poll(() => page.evaluate(() => (window as any).lumox.selection.get())).toEqual([fx]);
    // The ordered-selection index badge appears on the selected node.
    await expect(node.locator('.st-idx')).toBeVisible();
  });

  test('exposes selection tools and a zoom slider', async ({ page }) => {
    await expect(page.locator('[data-tool="select"]')).toBeVisible();
    await expect(page.locator('.st-zslider')).toBeVisible();
  });

  test('the zoom slider scales the view', async ({ page }) => {
    const slider = page.locator('.st-zslider');
    const before = await slider.inputValue();
    await slider.fill(String(Math.min(900, Number(before) + 150)));
    await slider.dispatchEvent('input');
    await expect.poll(() => slider.inputValue()).not.toBe(before);
  });
});
