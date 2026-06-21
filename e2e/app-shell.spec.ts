import { test, expect, gotoTab } from './fixtures';

// App shell — frameless titlebar, tab navigation, project name/dirty marker, the
// ⋯ app menu, the master BPM clock, window controls, and undo/redo.
test.describe('app shell', () => {
  test('boots the demo show with the three titlebar tabs', async ({ page }) => {
    await expect(page.locator('#titlebar')).toBeVisible();
    await expect(page.locator('.tb-tab')).toHaveCount(3);
    for (const t of ['setup', 'control', 'connection']) {
      await expect(page.locator(`.tb-tab[data-tab="${t}"]`)).toBeVisible();
    }
    // Demo show detached to an untitled "Demo Show".
    await expect(page.locator('.tb-doc')).toContainText('Demo Show');
  });

  test('tab navigation toggles the workspace vs. the connection view', async ({ page }) => {
    await gotoTab(page, 'setup');
    await expect(page.locator('.workspace')).toBeVisible();
    await expect(page.locator('.connection-view')).toBeHidden();

    await gotoTab(page, 'connection');
    await expect(page.locator('.tb-tab[data-tab="connection"]')).toHaveClass(/active/);
    await expect(page.locator('.connection-view')).toBeVisible();
    await expect(page.locator('.workspace')).toBeHidden();

    await gotoTab(page, 'control');
    await expect(page.locator('.workspace')).toBeVisible();
    await expect(page.locator('.bank-tile')).toBeVisible();
  });

  test('SETUP shows library + patch + limits; CONTROL shows banks + scene props + faders', async ({ page }) => {
    await gotoTab(page, 'setup');
    await expect(page.locator('.lib-tile')).toBeVisible();
    await expect(page.locator('.pg-tile')).toBeVisible();
    await expect(page.locator('.limits-tile')).toBeVisible();
    await expect(page.locator('.fader-tile')).toBeHidden();

    await gotoTab(page, 'control');
    await expect(page.locator('.bank-tile')).toBeVisible();
    await expect(page.locator('.sceneprops-tile')).toBeVisible();
    await expect(page.locator('.fader-tile')).toBeVisible();
    await expect(page.locator('.limits-tile')).toBeHidden();
  });

  test('the ⋯ app menu opens with the project + edit actions', async ({ page }) => {
    await page.click('#app-menu-btn');
    const menu = page.locator('.ctx-menu');
    await expect(menu).toBeVisible();
    for (const label of ['Undo', 'Redo', 'New Project', 'Open Project…', 'Save Project', 'Settings…', 'Debug — all faders']) {
      await expect(menu.getByText(label, { exact: false }).first()).toBeVisible();
    }
    // Clicking the toggle again (or elsewhere) closes it.
    await page.click('#app-menu-btn');
    await expect(menu).toHaveCount(0);
  });

  test('the master BPM clock edits the engine tempo', async ({ page }) => {
    const bpm = page.locator('#bpm-input');
    await bpm.fill('140');
    await bpm.dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => (window as any).lumox.transport.get().then((s: any) => s.bpm))).toBe(140);
    // Tap-tempo button is present and clickable.
    await expect(page.locator('#bpm-tap')).toBeVisible();
    await page.click('#bpm-tap');
  });

  test('window controls are present and report maximize state', async ({ page }) => {
    // Don't actually min/max/close (it would resize/quit the shared window) — assert
    // presence + the IPC state query the titlebar uses to swap the icon.
    for (const id of ['#win-min', '#win-max', '#win-close', '#midi-btn']) {
      await expect(page.locator(id)).toBeVisible();
    }
    const isMax = await page.evaluate(() => (window as any).lumox.win.isMaximized());
    expect(typeof isMax).toBe('boolean');
  });

  test('undo / redo revert a scene rename', async ({ page }) => {
    // Restoring a whole-show snapshot fires `project:loaded`, which reloads the
    // renderer — so each history step must be awaited through that reload.
    const history = async (action: 'undo' | 'redo') => {
      const loaded = page.waitForEvent('load', { timeout: 15_000 }).catch(() => {});
      await page.evaluate((a) => (window as any).lumox.history[a](), action).catch(() => {});
      await loaded;
      await page.waitForSelector('.gb-tile', { state: 'attached', timeout: 15_000 });
    };
    const sceneName = (sid: string) => page.evaluate((id) => (window as any).lumox.scenes.get(id).then((s: any) => s.name), sid);

    const scenes = await page.evaluate(() => (window as any).lumox.scenes.list());
    const id = scenes[0].id as string;
    const original = scenes[0].name as string;

    // Rename only marks the show dirty (no reload) — assert directly.
    await page.evaluate((sid) => (window as any).lumox.scenes.rename(sid, 'E2E Rename'), id);
    await expect.poll(() => sceneName(id)).toBe('E2E Rename');
    expect((await page.evaluate(() => (window as any).lumox.history.state())).canUndo).toBe(true);

    await history('undo');
    expect(await sceneName(id)).toBe(original);

    await history('redo');
    expect(await sceneName(id)).toBe('E2E Rename');

    // Restore the original name so the rest of the suite sees a clean show.
    await history('undo');
    expect(await sceneName(id)).toBe(original);
  });
});
