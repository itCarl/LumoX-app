import { test, expect, gotoTab } from './fixtures';

// CONTROL · Scene properties / FX-rack tile — reflects the scene selected for
// editing; the right rail switches pages (base / FX rack / scene / advanced).
test.describe('scene properties tile', () => {
  test.beforeEach(async ({ page }) => {
    await gotoTab(page, 'control');
    // Select the first scene for editing so the panel has a target.
    await page.locator('.scene-cell[data-scene]').first().locator('.sc-strip').click();
  });

  test('shows the selected scene title', async ({ page }) => {
    await expect(page.locator('.sceneprops-tile')).toBeVisible();
    await expect(page.locator('#sp-title')).not.toHaveText('');
  });

  test('the right rail switches between pages', async ({ page }) => {
    const rack = page.locator('.sp-railbtn[data-nav="rack"]');
    await rack.click();
    await expect(rack).toHaveClass(/active/);

    const adv = page.locator('.sp-railbtn[data-nav="adv"]');
    if (await adv.count()) {
      await adv.click();
      await expect(adv).toHaveClass(/active/);
    }
  });

  test('adding an FX layer appends a layer block (undoable)', async ({ page }) => {
    await page.locator('.sp-railbtn[data-nav="rack"]').click();
    const adders = page.locator('.fxadd-btn');
    await expect(adders.first()).toBeVisible();

    const before = await page.locator('.fxblock').count();
    await adders.first().click();
    await expect.poll(() => page.locator('.fxblock').count()).toBe(before + 1);

    // Roll the edit back so the next test sees the original rack.
    await page.evaluate(() => (window as any).lumox.history.undo());
    await expect.poll(() => page.locator('.fxblock').count()).toBe(before);
  });
});
