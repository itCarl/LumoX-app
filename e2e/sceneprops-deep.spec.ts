import { test, expect, ipc } from './fixtures';

// CONTROL · Scene properties / FX rack — deeper DOM interactions on a DISPOSABLE
// scene (selected in the banks UI), so the demo scenes stay untouched.
test.describe('scene properties interactions', () => {
  let sid: string;
  test.beforeEach(async ({ page }) => {
    sid = (await ipc<any>(page, 'scenes.capture', undefined, 'E2E UI Scene')).id;
    await page.reload();                                  // re-render banks so the new scene cell exists
    await page.waitForSelector('.gb-tile', { state: 'attached' });
    await page.click('.tb-tab[data-tab="control"]');
    await page.locator(`.scene-cell[data-scene="${sid}"] .sc-strip`).click();
    await expect(page.locator('#sp-title')).toContainText('E2E UI Scene');
  });
  test.afterEach(async ({ page }) => { await ipc(page, 'scenes.remove', sid).catch(() => {}); });

  test('the rail switches pages', async ({ page }) => {
    for (const nav of ['rack', 'scene', 'adv', 'base']) {
      const btn = page.locator(`.sp-railbtn[data-nav="${nav}"]`);
      if (await btn.count()) { await btn.click(); await expect(btn).toHaveClass(/active/); }
    }
  });

  test('every FX-add button appends a layer block', async ({ page }) => {
    await page.click('.sp-railbtn[data-nav="rack"]');
    const adders = page.locator('.fxadd-btn[data-kind]');
    const kinds = await adders.count();
    expect(kinds).toBe(6);
    for (let i = 0; i < kinds; i++) {
      const before = await page.locator('.fxblock').count();
      await adders.nth(i).click();
      await expect.poll(() => page.locator('.fxblock').count()).toBe(before + 1);
    }
    expect(await ipc<any>(page, 'scenes.get', sid).then((s) => s.layers.length)).toBe(6);
  });

  test('expanding/collapsing a layer block toggles open', async ({ page }) => {
    await page.click('.sp-railbtn[data-nav="rack"]');
    await page.locator('.fxadd-btn[data-kind="color"]').click();
    const block = page.locator('.fxblock').first();
    const head = block.locator('.fxblock-hd');
    const wasOpen = await block.evaluate((el) => el.classList.contains('open'));
    await head.click();
    await expect.poll(() => block.evaluate((el) => el.classList.contains('open'))).toBe(!wasOpen);
  });

  test('base STATIC / CHASE toggle changes the scene type', async ({ page }) => {
    await page.click('.sp-railbtn[data-nav="base"]');
    await page.click('.seg-btn[data-act="base"][data-val="chase"]');
    await expect.poll(() => ipc<any>(page, 'scenes.get', sid).then((s) => s.type)).toBe('chase');
    await page.click('.seg-btn[data-act="base"][data-val="static"]');
    await expect.poll(() => ipc<any>(page, 'scenes.get', sid).then((s) => s.type)).toBe('static');
  });
});
