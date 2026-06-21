import { test, expect, ipc } from './fixtures';

// SETUP · Stage — deeper interactions: tool rail, quick-select buttons, zoom
// controls, ordered-selection ops, and arrange.
test.describe('stage interactions', () => {
  test.beforeEach(async ({ page }) => { await page.click('.tb-tab[data-tab="setup"]'); });

  test('the tool rail switches the active tool', async ({ page }) => {
    for (const tool of ['rect', 'lasso', 'pan', 'select']) {
      await page.click(`[data-tool="${tool}"]`);
      await expect(page.locator(`[data-tool="${tool}"]`)).toHaveClass(/active/);
    }
  });

  test('quick-select buttons drive the selection', async ({ page }) => {
    await page.click('[data-sel="all"]');
    await expect.poll(() => ipc<string[]>(page, 'selection.get').then((s) => s.length)).toBe(24);

    await page.click('[data-sel="none"]');
    await expect.poll(() => ipc<string[]>(page, 'selection.get').then((s) => s.length)).toBe(0);

    await page.locator('.st-node[data-fx]').first().click();
    await page.click('[data-sel="invert"]');
    await expect.poll(() => ipc<string[]>(page, 'selection.get').then((s) => s.length)).toBe(23);
  });

  test('zoom in / out / fit move the zoom slider', async ({ page }) => {
    const slider = page.locator('.st-zslider');
    const start = Number(await slider.inputValue());
    await page.click('[data-zoom="in"]');
    await expect.poll(() => slider.inputValue().then(Number)).toBeGreaterThan(start);
    await page.click('[data-zoom="out"]');
    await page.click('[data-zoom="out"]');
    await expect.poll(() => slider.inputValue().then(Number)).toBeLessThan(start + 1);
    await page.click('[data-zoom="fit"]');   // must not throw
  });

  test('order-invert reverses the ordered selection', async ({ page }) => {
    await page.click('[data-sel="all"]');
    const before = await ipc<string[]>(page, 'selection.get');
    await page.click('[data-act="order-invert"]');
    await expect.poll(() => ipc<string[]>(page, 'selection.get')).toEqual([...before].reverse());
  });

  test('arrange repositions the selected fixtures', async ({ page }) => {
    await page.click('[data-sel="all"]');
    const before = (await ipc<any[]>(page, 'patch.list')).map((f) => `${f.transform.x},${f.transform.y}`).join('|');
    await page.click('[data-act="arrange-circle"]');
    await expect
      .poll(() => ipc<any[]>(page, 'patch.list').then((l) => l.map((f) => `${f.transform.x},${f.transform.y}`).join('|')))
      .not.toBe(before);
  });
});
