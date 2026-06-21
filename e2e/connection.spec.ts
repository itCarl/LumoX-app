import { test, expect, gotoTab } from './fixtures';

// CONNECTION tab — DMX output transport (Art-Net / sACN per universe), node
// discovery, and the audio-input section (spectrum meter + bindings).
test.describe('connection view', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'connection'); });

  test('renders the output section with a row per universe', async ({ page }) => {
    await expect(page.locator('.cx-view-inner')).toBeVisible();
    await expect(page.locator('.cx-railbtn[data-sec="output"]')).toBeVisible();
    expect(await page.locator('.cx-row[data-u]').count()).toBeGreaterThan(0);
  });

  test('protocol select drives the target-IP field state', async ({ page }) => {
    const row = page.locator('.cx-row[data-u]').first();
    const proto = row.locator('.cx-proto');
    const ip = row.locator('.cx-ip');

    await proto.selectOption('sacn');
    await expect(ip).toBeDisabled();           // sACN is multicast — no unicast IP
    await proto.selectOption('artnet');
    await expect(ip).toBeEnabled();
  });

  test('switching to the audio section reveals the spectrum meter', async ({ page }) => {
    await page.click('.cx-railbtn[data-sec="audio"]');
    await expect(page.locator('.cx-railbtn[data-sec="audio"]')).toHaveClass(/active/);
    await expect(page.locator('#cx-audio-bars')).toBeVisible();

    await page.click('.cx-railbtn[data-sec="output"]');
    await expect(page.locator('.cx-row[data-u]').first()).toBeVisible();
  });

  test('the node-discovery scan control is present', async ({ page }) => {
    await expect(page.locator('#cx-disc-scan')).toBeVisible();
  });
});
