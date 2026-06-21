import { test, expect, ipc } from './fixtures';

// CONNECTION — deeper DOM interactions: per-universe output controls (mode / rate /
// enable toggle) and audio-reactive binding add. Output edits round-trip back.
test.describe('connection interactions', () => {
  test.beforeEach(async ({ page }) => { await page.click('.tb-tab[data-tab="connection"]'); });

  test('the enable toggle flips the output state', async ({ page }) => {
    const toggle = page.locator('.cx-row[data-u] .cx-toggle').first();
    const wasOn = await toggle.evaluate((el) => el.classList.contains('on'));
    await toggle.click();
    await expect.poll(() => toggle.evaluate((el) => el.classList.contains('on'))).toBe(!wasOn);
    await toggle.click();   // restore
    await expect.poll(() => toggle.evaluate((el) => el.classList.contains('on'))).toBe(wasOn);
  });

  test('frame-mode + refresh-rate controls accept edits', async ({ page }) => {
    const row = page.locator('.cx-row[data-u]').first();
    const mode = row.locator('.cx-mode');
    const original = await mode.inputValue();
    const other = (await mode.locator('option').allTextContents()).length;
    expect(other).toBeGreaterThan(1);
    await mode.selectOption({ index: 0 });
    const rate = row.locator('.cx-rate');
    await rate.fill('25');
    await rate.dispatchEvent('change');
    await expect(rate).toHaveValue('25');
    await mode.selectOption(original);   // restore mode
  });

  test('adding an audio binding appends a binding row', async ({ page }) => {
    await page.click('.cx-railbtn[data-sec="audio"]');
    const before = await ipc<any[]>(page, 'audio.listBindings');
    await page.click('#cx-audio-add');
    await expect.poll(() => page.locator('.cx-bind').count()).toBe(before.length + 1);
    await expect(page.locator('.cx-bind .cx-bind-src').first()).toBeVisible();
    await expect(page.locator('.cx-bind .cx-bind-tgt').first()).toBeVisible();

    // Clean up the binding we added.
    const after = await ipc<any[]>(page, 'audio.listBindings');
    const added = after.find((b) => !before.some((x) => x.id === b.id));
    if (added) await ipc(page, 'audio.removeBinding', added.id);
  });

  test('the audio bands input is bounded 1–32', async ({ page }) => {
    await page.click('.cx-railbtn[data-sec="audio"]');
    const bands = page.locator('#cx-audio-bands-n');
    await bands.fill('16');
    await bands.dispatchEvent('change');
    await expect.poll(() => ipc<any>(page, 'settings.get').then((s) => s.audioBands)).toBe(16);
    await ipc(page, 'settings.update', { audioBands: 8 });   // restore default
  });
});
