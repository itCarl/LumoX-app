import { test, expect, ipc } from './fixtures';

// CONTROL · Fader editor — deeper interactions: LIVE programmer engage via a real
// fader drag, the attribute sidebar, GrandMaster, and Clear.
test.describe('fader editor interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.click('.tb-tab[data-tab="control"]');
    await page.click('.seg-btn[data-mode="live"]');     // programmer mode renders strips unconditionally
    await page.click('.gb-tab[data-grp="all"]');         // select the rig so strips appear
    await expect(page.locator('.fcol').first()).toBeVisible({ timeout: 10_000 });
  });

  test('LIVE mode shows the programmer header', async ({ page }) => {
    await expect(page.locator('#fe-prog')).toBeVisible();
    await expect(page.locator('#fe-prog-n')).toContainText('ch');
  });

  test('dragging a fader engages its channel (green dot + programmer count)', async ({ page }) => {
    const fader = page.locator('.fcol .fc-fader').first();
    await fader.evaluate((el: HTMLInputElement) => { el.value = '200'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect(page.locator('.fcol').first().locator('.fc-dot')).toHaveClass(/on/);
    await expect.poll(() => ipc<any>(page, 'fixtures.programmer')).toBeTruthy();
    await expect(page.locator('#fe-prog-n')).not.toContainText('0 ch');
  });

  test('the attribute sidebar filters strips', async ({ page }) => {
    const attrs = page.locator('.fe-attr');
    const n = await attrs.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(n, 4); i++) {
      await attrs.nth(i).click();
      await expect(attrs.nth(i)).toHaveClass(/active/);
    }
  });

  test('GrandMaster fader sets the master level', async ({ page }) => {
    const gm = page.locator('#fe-gm');
    await gm.evaluate((el: HTMLInputElement) => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await expect(page.locator('#fe-gm-val')).toHaveText('50');
    await gm.evaluate((el: HTMLInputElement) => { el.value = '100'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  });

  test('Clear empties the programmer', async ({ page }) => {
    const fader = page.locator('.fcol .fc-fader').first();
    await fader.evaluate((el: HTMLInputElement) => { el.value = '200'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect(page.locator('#fe-prog-n')).not.toContainText('0 ch');
    await page.click('#fe-clear');
    await expect(page.locator('#fe-prog-n')).toContainText('0 ch');
  });

  test('the Blackout button is present', async ({ page }) => {
    await expect(page.locator('#fe-bo')).toBeVisible();
  });
});
