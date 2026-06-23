import { test, expect, gotoTab, ipc } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

// Deep coverage of selecting scene fixtures + using scenes, and the text-prompt
// dialog that renames them (native window.prompt() is unsupported in Electron —
// these flows would silently throw without the dialog-window prompt).

async function waitDialog(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('dialog.html'));
  const dlg = existing ?? (await app.waitForEvent('window', { predicate: (w) => w.url().endsWith('dialog.html'), timeout: 10_000 }));
  await dlg.waitForLoadState('domcontentloaded');
  await dlg.waitForSelector('.dlg-input', { timeout: 5_000 });
  return dlg;
}

test.describe('text-prompt dialog', () => {
  test('prompt round-trips the typed value, and cancel yields null', async ({ page, electronApp }) => {
    // Save (typed value) ------------------------------------------------------
    const okResult = page.evaluate(() => (window as any).lumox.dialog.prompt({
      title: 'Rename scene', message: '',
      input: { value: 'seed' },
      buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Save', variant: 'primary' }],
      cancelId: 'cancel',
    }));
    let dlg = await waitDialog(electronApp);
    await expect(dlg.locator('.dlg-input')).toHaveValue('seed');   // seeded + (focused/selected)
    await dlg.locator('.dlg-input').fill('Typed Name');
    await dlg.locator('#dlg-foot button[data-id="ok"]').click();
    expect(await okResult).toBe('Typed Name');

    // Cancel → null -----------------------------------------------------------
    const cancelResult = page.evaluate(() => (window as any).lumox.dialog.prompt({
      title: 'Rename scene', message: '',
      input: { value: 'seed' },
      buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Save', variant: 'primary' }],
      cancelId: 'cancel',
    }));
    dlg = await waitDialog(electronApp);
    await dlg.locator('#dlg-foot button[data-id="cancel"]').click();
    expect(await cancelResult).toBeNull();
  });
});

test.describe('scene rename via the context menu', () => {
  test('renames a scene through the dialog prompt', async ({ page, electronApp }) => {
    await gotoTab(page, 'control');
    await page.waitForSelector('.scene-cell');

    const first = await ipc<any>(page, 'banks.list').then((bs: any[]) => ({
      id: bs[0].scenes[0].id, name: bs[0].scenes[0].name,
    }));

    // Right-click the cell → "Rename…" → the text prompt opens in its own window.
    await page.click(`.scene-cell[data-scene="${first.id}"]`, { button: 'right' });
    await page.locator('.ctx-menu').getByText('Rename', { exact: false }).click();

    const dlg = await waitDialog(electronApp);
    await expect(dlg.locator('.dlg-input')).toHaveValue(first.name);
    await dlg.locator('.dlg-input').fill('E2E Renamed');
    await dlg.locator('#dlg-foot button[data-id="ok"]').click();

    // The cell label updates, and the engine holds the new name.
    await expect(page.locator(`.scene-cell[data-scene="${first.id}"] .sc-name`)).toHaveText('E2E Renamed');
    expect(await ipc<any[]>(page, 'scenes.list').then((ss) => ss.find((s) => s.id === first.id)?.name)).toBe('E2E Renamed');

    // Restore the demo show's original name.
    await ipc(page, 'scenes.rename', first.id, first.name);
  });
});

test.describe('selecting scene fixtures', () => {
  test('the scene strip selects the scene\'s fixtures and targets the fader editor', async ({ page }) => {
    await gotoTab(page, 'control');
    await page.waitForSelector('.scene-cell');
    await ipc(page, 'selection.clear');

    // Pick a scene that actually drives fixtures.
    const target = await ipc<any[]>(page, 'banks.list').then((bs) => {
      const s = (bs[0].scenes as any[]).find((x) => (x.fixtureIds || []).length) ?? bs[0].scenes[0];
      return { id: s.id, name: s.name, fixtureIds: s.fixtureIds as string[] };
    });

    await page.click(`.scene-cell[data-scene="${target.id}"] .sc-strip`);

    // Live selection now matches the scene's fixtures (auto-select for editing).
    await expect.poll(() => ipc<string[]>(page, 'selection.get')).toEqual(target.fixtureIds);
    // The cell is flagged selected-for-edit, and the fader editor adopts the scene.
    await expect(page.locator(`.scene-cell[data-scene="${target.id}"]`)).toHaveClass(/selected/);
    await expect(page.locator('#fe-target')).toContainText(target.name);
    // The stage paints one badge per selected fixture.
    await expect.poll(() => page.locator('.st-node.sel .st-idx').count()).toBe(target.fixtureIds.length);
  });

  test('activating a scene by its body follows as edit target but keeps the selection', async ({ page }) => {
    await gotoTab(page, 'control');
    await page.waitForSelector('.scene-cell');

    // A deliberate manual selection the user is programming.
    const ids = await ipc<any[]>(page, 'patch.list').then((f) => f.map((x) => x.id));
    const manual = [ids[2], ids[0], ids[1]];
    await ipc(page, 'selection.set', manual);

    const target = await ipc<any[]>(page, 'banks.list').then((bs) => {
      const s = (bs[0].scenes as any[]).find((x) => (x.fixtureIds || []).length) ?? bs[0].scenes[0];
      return { id: s.id, name: s.name };
    });

    // Click the BODY (not the strip) to fire it live.
    await page.click(`.scene-cell[data-scene="${target.id}"] .sc-box`);

    // Plays + the editor follows it...
    await expect(page.locator(`.scene-cell[data-scene="${target.id}"]`)).toHaveClass(/active/);
    await expect(page.locator('#fe-target')).toContainText(target.name);
    // ...but the manual selection is untouched.
    expect(await ipc<string[]>(page, 'selection.get')).toEqual(manual);

    await ipc(page, 'scenes.recall', target.id, false);   // cleanup: stop playback
  });

  test('a group tab selects that group\'s fixtures', async ({ page }) => {
    await gotoTab(page, 'control');
    await ipc(page, 'selection.clear');

    const grp = await ipc<any[]>(page, 'groups.list').then((gs) => {
      const g = gs.find((x) => (x.fixtureIds || []).length) ?? gs[0];
      return { id: g.id, fixtureIds: g.fixtureIds as string[] };
    });

    await page.click(`.gb-tab[data-grp="${grp.id}"]`);
    await expect.poll(() => ipc<string[]>(page, 'selection.get')).toEqual(grp.fixtureIds);
  });
});
