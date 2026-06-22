// Shared Playwright harness for the Lumox Electron E2E suite.
//
// Boots the REAL app (dist/main/index.cjs) through Playwright's Electron driver —
// main process + headless engine + preload + renderer, exactly as `npm start` does.
// Env mirrors the screenshot harness: LUMOX_SEED=1 forces the bundled demo show
// (18 fixtures, auto-groups, 8 banks of scenes) so every view has real content;
// LUMOX_DEV=1 enables the `window.lumox.dev.eval` bridge for engine introspection;
// ELECTRON_RUN_AS_NODE must be unset or main/index.ts bails by design.
//
// The app is single-instance and owns exclusive Art-Net/sACN sockets, so the suite
// runs strictly serial (workers: 1). The Electron app is worker-scoped (booted once
// per spec file) and reset before every test by `resetState`.

import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]e2e$/, '');

export const VIEWPORT = { width: 1920, height: 1080 };

type Fixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

/** Run code in the MAIN process via the dev bridge (engine/show/banks in scope).
 *  Returns the JSON result. Requires LUMOX_DEV=1 (the harness sets it). */
export async function dev<T = unknown>(page: Page, code: string): Promise<T> {
  return page.evaluate((c) => (window as unknown as { lumox: { dev: { eval: (s: string) => Promise<unknown> } } }).lumox.dev.eval(c), code) as Promise<T>;
}

/** Call a `window.lumox` IPC method by dotted path from the renderer, e.g.
 *  `ipc(page, 'scenes.rename', id, 'X')`. This drives the REAL preload bridge →
 *  main process → engine, so it is an end-to-end integration call, not a stub. */
export async function ipc<T = any>(page: Page, path: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(({ path, args }) => {
    const parts = path.split('.');
    let ctx: any = (window as any).lumox;
    for (let i = 0; i < parts.length - 1; i++) ctx = ctx[parts[i]];
    return ctx[parts[parts.length - 1]](...args);
  }, { path, args }) as Promise<T>;
}

/** Switch the main window to a titlebar tab (setup / control / connection). */
export async function gotoTab(page: Page, tab: 'setup' | 'control' | 'connection'): Promise<void> {
  await page.click(`.tb-tab[data-tab="${tab}"]`);
  await page.waitForFunction(
    (t) => document.querySelector(`.tb-tab[data-tab="${t}"]`)?.classList.contains('active') ?? false,
    tab,
  );
}

/** The first window whose URL is the main renderer (index.html), not a child window. */
export async function mainWindow(electronApp: ElectronApplication): Promise<Page> {
  for (const w of electronApp.windows()) {
    if (w.url().endsWith('index.html')) return w;
  }
  // Fall back to waiting for it.
  return electronApp.waitForEvent('window', { predicate: (w) => w.url().endsWith('index.html') });
}

/** Reset the app to a clean baseline between tests: close child windows, drop the
 *  live selection + programmer, restore master/blackout, return to the Setup tab.
 *  Cheap (IPC + DOM) — avoids re-launching Electron for every test. */
export async function resetState(electronApp: ElectronApplication, page: Page): Promise<void> {
  // Destroy any secondary windows a previous test opened (editor / midi / dialog /
  // panel) so they don't bleed into the next test.
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      const url = w.webContents.getURL();
      if (!url.endsWith('index.html') && !w.isDestroyed()) w.destroy();
    }
  });
  // Reload the renderer so every test starts from a pristine DOM. The app is
  // worker-scoped (booted once), so without this, view-local UI state — an
  // expanded library accordion, the selected scene, the active rail page, the
  // fader mode — would leak between tests. The engine/show state survives the
  // reload; we reset that explicitly below.
  await page.reload();
  await page.waitForSelector('.gb-tile', { state: 'attached', timeout: 30_000 });
  await page.waitForSelector('.workspace', { state: 'visible' });
  await page.evaluate(async () => {
    const l = (window as unknown as { lumox: any }).lumox;
    // Turn off any scene a previous test left live.
    const scenes = await l.scenes.list().catch(() => []);
    for (const s of scenes) if (s.active) await l.scenes.recall(s.id, false).catch(() => {});
    await l.selection.clear().catch(() => {});
    await l.fixtures.clearProgrammer().catch(() => {});
    await l.master.set(255).catch(() => {});
    await l.blackout.set(false).catch(() => {});
  });
  await gotoTab(page, 'setup');
}

export const test = base.extend<Record<string, never>, Fixtures>({
  // One Electron app per worker (= per spec file, since workers: 1). Forcing the
  // window to a 1920×1080 content box satisfies the fixed-resolution requirement.
  electronApp: [
    // Playwright parses this signature for fixture deps — it MUST be a destructure.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const env: Record<string, string> = { ...process.env, LUMOX_SEED: '1', LUMOX_DEV: '1', NODE_ENV: 'development' } as Record<string, string>;
      delete (env as Record<string, string | undefined>).ELECTRON_RUN_AS_NODE;

      const electronApp = await electron.launch({ args: ['.'], cwd: APP_ROOT, env });

      const win = await electronApp.firstWindow();
      // The app maximizes on boot; pin a deterministic 1920×1080 content box.
      await electronApp.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w) { w.unmaximize(); w.setContentSize(1920, 1080); }
      });
      await win.waitForSelector('.gb-tile', { state: 'attached', timeout: 30_000 });
      await win.waitForSelector('.workspace', { state: 'visible' });

      await use(electronApp);

      // Force-exit past the unsaved-changes close guard (a dirty show would pop the
      // dialog window and hang the graceful close). app.exit bypasses before-quit.
      await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await electronApp.close().catch(() => {});
    },
    { scope: 'worker' },
  ],

  // The main renderer window, reset to baseline before each test.
  page: [
    async ({ electronApp }, use) => {
      const page = await mainWindow(electronApp);
      await resetState(electronApp, page);
      await use(page);
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
