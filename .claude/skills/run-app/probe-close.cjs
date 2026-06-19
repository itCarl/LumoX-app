// Close-guard probe — verifies the unsaved-changes dialog (renderer/dialog.html,
// a custom frameless window, NOT a native showMessageBox): Cancel keeps the
// window open, Don't Save closes it. Boots the real main, makes a dirtying edit,
// then drives the dialog window's buttons.
//
//   electron .claude/skills/run-app/probe-close.cjs   (or via the shot wrapper's env)

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const APP_DIR = path.resolve(__dirname, '..', '..', '..');
const MAIN = path.join(APP_DIR, 'dist', 'main', 'index.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (wc, code) => wc.executeJavaScript(code, true);
const step = (m) => console.log('[close]', m);

app.disableHardwareAcceleration();
require(MAIN);

const byUrl = (suffix) => BrowserWindow.getAllWindows().find((w) => {
  try { return w.webContents.getURL().endsWith(suffix); } catch { return false; }
});

async function waitFor(suffix, tries = 160) {
  for (let i = 0; i < tries; i++) { const w = byUrl(suffix); if (w && !w.webContents.isLoading()) return w; await sleep(150); }
  return null;
}

// Click a button in the dialog window by its data-id, once it has rendered.
async function clickDialog(id) {
  const d = await waitFor('dialog.html', 40);
  if (!d) return 'no dialog window';
  return js(d.webContents, `(async () => {
    for (let i = 0; i < 40; i++) {
      const b = document.querySelector('button[data-id="${id}"]');
      if (b) { b.click(); return '${id}'; }
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  })()`);
}

app.whenReady().then(async () => {
  const win = await waitFor('index.html');
  if (!win) throw new Error('no main window');
  await sleep(900);

  // Make a dirtying edit (apply a limit to the first fixture), then confirm
  // dirty=true. Caught in-page so a future IPC change can't abort the probe.
  step('dirtying edit: ' + await js(win.webContents, `(async () => {
    try {
      const list = await window.lumox.patch.list();
      if (!list[0]) return 'no fixtures';
      await window.lumox.fixtures.setLimits([list[0].id], { dimmer: { max: 123 } });
      return 'ok';
    } catch (e) { return 'edit error: ' + e.message; }
  })()`));
  await sleep(400);
  step('project dirty after edit: ' + await js(win.webContents, `(async () => (await window.lumox.project.info()).dirty)()`));

  // 1) Cancel → the close is vetoed, window must stay open.
  win.close();
  step('clicked: ' + await clickDialog('cancel'));
  await sleep(500);
  step(`after Cancel: window destroyed=${win.isDestroyed()} (expect false)`);

  // 2) Don't Save → discard, window must actually close. Log the closure synchronously
  // from the 'closed' event (the app then quits naturally via window-all-closed).
  win.once('closed', () => { step("after Don't Save: window closed ✓ (expect close)"); step('done'); });
  if (!win.isDestroyed()) win.close();
  step('clicked: ' + await clickDialog('dont-save'));
  setTimeout(() => app.exit(0), 3000);   // safety net only if the close didn't quit us
}).catch((e) => { step('FAILED ' + (e && e.message)); app.exit(1); });
