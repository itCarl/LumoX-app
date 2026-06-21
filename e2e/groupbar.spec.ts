import { test, expect, gotoTab } from './fixtures';

// Groups strip (shared across SETUP + CONTROL) — the "All" selector plus one tab
// per auto-group, each selecting its fixtures.
test.describe('groups bar', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'setup'); });

  test('renders the All tab plus auto-group tabs', async ({ page }) => {
    await expect(page.locator('.gb-tile')).toBeVisible();
    await expect(page.locator('.gb-tab[data-grp="all"]')).toBeVisible();
    expect(await page.locator('.gb-tab').count()).toBeGreaterThan(1);
  });

  test('the All tab selects the whole rig', async ({ page }) => {
    await page.click('.gb-tab[data-grp="all"]');
    await expect(page.locator('.gb-tab[data-grp="all"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => (window as any).lumox.selection.get().then((s: string[]) => s.length))).toBe(24);
  });

  test('a group tab selects exactly that group', async ({ page }) => {
    const groups = await page.evaluate(() => (window as any).lumox.groups.list());
    expect(groups.length).toBeGreaterThan(0);
    const g = groups[0];
    await page.click(`.gb-tab[data-grp="${g.id}"]`);
    await expect(page.locator(`.gb-tab[data-grp="${g.id}"]`)).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => (window as any).lumox.selection.get().then((s: string[]) => s.length))).toBe(g.fixtureIds.length);
  });
});
