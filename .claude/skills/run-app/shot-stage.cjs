// Stage / selection scenario — verifies F1 ordered-selection: index badges on
// the stage + patch grid, and the "Selection order" rail ops (reverse/mirror).
// Boots the real main (seeded demo rig) and drives the SETUP tab.
//
//   node_modules/electron/dist/electron.exe .claude/skills/run-app/shot-stage.cjs

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const APP_DIR = path.resolve(__dirname, '..', '..', '..');
const MAIN = path.join(APP_DIR, 'dist', 'main', 'index.cjs');
const OUT = process.env.LUMOX_SHOT_DIR || path.join(APP_DIR, '.shots');
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(MAIN)) { console.error('[shot] build first'); process.exit(1); }

app.disableHardwareAcceleration();
require(MAIN);

const LOG = path.join(OUT, 'driver-stage.log');
const step = (m) => { try { fs.appendFileSync(LOG, m + '\n'); } catch {} console.log('[shot]', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (wc, code) => wc.executeJavaScript(code, true);

async function waitForWindow() {
  for (let i = 0; i < 160; i++) { const w = BrowserWindow.getAllWindows()[0]; if (w && !w.webContents.isLoading()) return w; await sleep(250); }
  throw new Error('window never appeared');
}
async function waitFor(wc, expr, label, tries = 160) {
  for (let i = 0; i < tries; i++) { try { if (await js(wc, `!!(${expr})`)) return; } catch {} await sleep(250); }
  throw new Error('timeout waiting for ' + (label || expr));
}
function attachDiagnostics(wc) {
  wc.on('console-message', (_e, level, message) => { if (level >= 2) step('renderer console[' + level + ']: ' + message); });
  wc.on('render-process-gone', (_e, d) => step('render-process-gone: ' + JSON.stringify(d)));
}
async function capture(win, rect) {
  for (let i = 0; i < 6; i++) {
    try { win.showInactive(); const img = await win.webContents.capturePage(rect); if (img && img.getSize().width > 0) return img; }
    catch (e) { step('capture retry ' + i + ': ' + e.message); }
    await sleep(500);
  }
  throw new Error('capturePage failed');
}
async function shoot(win, name, sel) {
  let rect;
  if (sel) {
    const r = await js(win.webContents, `(() => { const e = document.querySelector('${sel}'); if (!e) return null; const b = e.getBoundingClientRect(); return { x:b.x, y:b.y, width:b.width, height:b.height }; })()`);
    if (r && r.width > 1) rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }
  const img = await capture(win, rect);
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  step('wrote ' + name + '.png');
}

app.whenReady().then(async () => {
  const win = await waitForWindow();
  const wc = win.webContents;
  attachDiagnostics(wc);
  await sleep(800);
  await waitFor(wc, `document.querySelector('.stage-tile')`, 'stage tile');
  await waitFor(wc, `document.querySelectorAll('.st-node').length > 3`, 'stage nodes');
  step('stage mounted');

  // SETUP tab (stage shared bottom-left; patch grid top-right)
  await js(wc, `document.querySelector('.tb-tab[data-tab="setup"]').click()`);
  await sleep(400);

  // Build an ORDERED selection by clicking 5 nodes (first plain, rest shift-add).
  const n = await js(wc, `(() => {
    let count = 0;
    for (let i = 0; i < 5; i++) {
      // Re-query each click: the stage rebuilds its DOM on every selection change,
      // so a cached node reference goes stale (detached) after the first click.
      const node = document.querySelectorAll('.st-node')[i];
      if (!node) break;
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: i > 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      count++;
    }
    return count;
  })()`);
  step('selected nodes: ' + n);
  await sleep(500);

  const mainSel = await js(wc, `window.lumox.selection.get().then(ids => ids.length)`);
  step('main selection length: ' + mainSel);

  await shoot(win, 'stage-01-selected', '.stage-tile');
  await shoot(win, 'stage-02-patchgrid', '.pg-tile');

  // Reverse the selection order via the rail op → badges should renumber.
  await js(wc, `document.querySelector('.st-rail [data-selop="reverse"]').click()`);
  await sleep(500);
  await shoot(win, 'stage-03-reversed', '.stage-tile');

  // Whole SETUP window for context.
  await shoot(win, 'stage-04-window');

  step('done → ' + OUT);
  app.quit();
}).catch(async (err) => {
  step('FAILED: ' + (err && err.message ? err.message : err));
  try { const w = BrowserWindow.getAllWindows()[0]; if (w) fs.writeFileSync(path.join(OUT, 'stage-error.png'), (await w.webContents.capturePage()).toPNG()); } catch {}
  app.quit();
});
