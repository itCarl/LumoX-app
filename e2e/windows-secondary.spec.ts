import { test, expect } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

// Secondary BrowserWindows — each is a real top-level window with its own taskbar
// entry (no in-app modal overlays): MIDI mapping, fixture editor, Settings panel,
// and the generic dialog. Verify each opens, loads its page, and is interactive.
async function waitWindow(app: ElectronApplication, htmlFile: string): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith(htmlFile));
  const win = existing ?? (await app.waitForEvent('window', { predicate: (w) => w.url().endsWith(htmlFile), timeout: 10_000 }));
  await win.waitForLoadState('domcontentloaded');
  return win;
}

test.describe('secondary windows', () => {
  test('MIDI mapping window opens from the titlebar button', async ({ page, electronApp }) => {
    await page.click('#midi-btn');
    const midi = await waitWindow(electronApp, 'midi.html');
    await expect(midi.locator('#mw-root')).toBeVisible();
    await expect(midi.locator('#mw-add')).toBeVisible();
    await expect(midi.locator('#mw-status')).toBeVisible();
    await midi.close();
  });

  test('fixture editor window opens with its model form', async ({ page, electronApp }) => {
    await page.evaluate(() => (window as any).lumox.editor.open());
    const ed = await waitWindow(electronApp, 'fixtureeditor.html');
    await expect(ed.locator('#fe-root')).toBeVisible();
    expect(await ed.locator('input, select').count()).toBeGreaterThan(0);
    await ed.close();
  });

  test('Settings panel opens from the ⋯ menu', async ({ page, electronApp }) => {
    await page.click('#app-menu-btn');
    await page.getByText('Settings…', { exact: false }).click();
    const panel = await waitWindow(electronApp, 'panel.html');
    await expect(panel.locator('#panel-root')).toBeVisible();
    expect(await panel.locator('select, .lx-select').count()).toBeGreaterThan(0);
    await panel.close();
  });

  test('the generic dialog window prompts and resolves', async ({ page, electronApp }) => {
    const result = page.evaluate(() => (window as any).lumox.dialog.open({
      title: 'E2E Prompt', message: 'Pick one', buttons: [{ id: 'ok', label: 'OK', variant: 'primary' }], cancelId: 'ok', width: 360, height: 160,
    }));
    const dlg = await waitWindow(electronApp, 'dialog.html');
    await expect(dlg.locator('#dlg-title')).toHaveText(/E2E Prompt/);
    const okBtn = dlg.locator('#dlg-foot button[data-id="ok"]');
    await expect(okBtn).toBeVisible();
    await okBtn.click();
    expect(await result).toBe('ok');
  });
});
