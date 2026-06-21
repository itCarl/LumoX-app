import { test, expect, gotoTab } from './fixtures';

// CONTROL · Banks tile — banks of scene cells; clicking a cell toggles it live.
test.describe('banks tile', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'control'); });

  test('renders bank tabs and scene cells from the demo show', async ({ page }) => {
    await expect(page.locator('.bank-tile')).toBeVisible();
    expect(await page.locator('.bk-tab').count()).toBeGreaterThan(1);
    expect(await page.locator('.scene-cell[data-scene]').count()).toBeGreaterThan(0);
  });

  test('clicking a scene toggles it live, clicking again releases it', async ({ page }) => {
    const cell = page.locator('.scene-cell[data-scene]').first();
    const sid = await cell.getAttribute('data-scene');
    const isLive = () => page.evaluate((id) => (window as any).lumox.scenes.list().then((ss: any[]) => ss.find((s) => s.id === id)?.active), sid);

    await cell.locator('.sc-box').click();
    await expect.poll(isLive).toBe(true);
    await expect(cell).toHaveClass(/active/);

    await cell.locator('.sc-box').click();
    await expect.poll(isLive).toBe(false);
  });

  test('switching banks marks the active bank tab', async ({ page }) => {
    const tabs = page.locator('.bk-tab[data-bank]');
    const second = tabs.nth(1);
    await second.click();
    await expect(second).toHaveClass(/active/);
  });

  test('clicking a scene strip selects it for editing', async ({ page }) => {
    const cell = page.locator('.scene-cell[data-scene]').first();
    await cell.locator('.sc-strip').click();
    await expect(cell).toHaveClass(/selected/);
  });
});
