import { test, expect, gotoTab } from './fixtures';

// SETUP · Limits tile — per-fixture output limits, driven by the live selection.
test.describe('limits tile', () => {
  test.beforeEach(async ({ page }) => { await gotoTab(page, 'setup'); });

  test('shows a ghost (no Clear, no name) with nothing selected', async ({ page }) => {
    await expect(page.locator('.limits-tile')).toBeVisible();
    await expect(page.locator('.lt-clear')).toBeHidden();   // visibility:hidden when empty
    await expect(page.locator('.lt-sel')).toHaveText('');
  });

  test('reflects the selected fixture and enables Clear', async ({ page }) => {
    const node = page.locator('.st-node[data-fx]').first();
    await node.click();
    await expect(page.locator('.lt-clear')).toBeVisible();
    await expect(page.locator('.lt-sel')).not.toHaveText('');
  });

  test('shows a count label for a multi-fixture selection', async ({ page }) => {
    await page.click('.gb-tab[data-grp="all"]');   // select the whole rig
    await expect(page.locator('.lt-sel')).toHaveText(/fixtures/);
  });

  test('Clear resets limits on the selection without error', async ({ page }) => {
    const node = page.locator('.st-node[data-fx]').first();
    await node.click();
    await page.click('.lt-clear');
    // Tile stays mounted + responsive after the clear.
    await expect(page.locator('.limits-tile')).toBeVisible();
    await expect(page.locator('.lt-sel')).not.toHaveText('');
  });
});
