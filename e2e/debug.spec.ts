import { test, expect } from './fixtures';

// Debug view (⋯ menu → "Debug — all faders") — a raw 512-channel fader grid that
// writes straight into the engine. Doubles as the deepest end-to-end check:
// renderer fader → IPC → engine programmer → MixPipeline → live universe buffer.
test.describe('debug fader grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.click('#app-menu-btn');
    await page.getByText('Debug — all faders').click();
    await expect(page.locator('#dbg-grid')).toBeVisible();
  });

  test('renders a fader per channel + a universe picker', async ({ page }) => {
    await expect(page.locator('#dbg-uni')).toBeVisible();
    expect(await page.locator('.dbg-fader').count()).toBe(512);
  });

  test('a fader drives the live mixed universe buffer', async ({ page }) => {
    const uni = await page.evaluate(() => (window as any).lumox.universes.list().then((u: any[]) => u[0].id));
    const fader = page.locator('.dbg-fader[data-ch="1"]');
    await fader.fill('200');
    await fader.dispatchEvent('input');
    await fader.dispatchEvent('change');
    await expect
      .poll(() => page.evaluate((id) => (window as any).lumox.universes.read(id).then((b: number[]) => b[0]), uni), { timeout: 8000 })
      .toBeGreaterThan(100);
  });

  test('Zero universe resets every fader and the buffer', async ({ page }) => {
    const uni = await page.evaluate(() => (window as any).lumox.universes.list().then((u: any[]) => u[0].id));
    const fader = page.locator('.dbg-fader[data-ch="1"]');
    await fader.fill('200');
    await fader.dispatchEvent('input');

    await page.locator('.dbg-head button', { hasText: 'Zero' }).click();
    await expect(fader).toHaveValue('0');
    await expect
      .poll(() => page.evaluate((id) => (window as any).lumox.universes.read(id).then((b: number[]) => b[0]), uni), { timeout: 8000 })
      .toBe(0);
  });
});
