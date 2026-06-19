// Headless-ish driver for the Lumox Electron app — no extra dependencies.
//
// It boots the REAL main process (dist/main/index.cjs), which on a dev launch
// seeds a full demo rig (fixtures + groups + scenes), then drives the renderer
// to the CONTROL fader editor and writes PNG screenshots via webContents.
// capturePage(). Used to verify UI changes without a human at the window.
//
// Run (from the app root):
//   node_modules/.bin/electron .claude/skills/run-app/shot.cjs
// Output: $LUMOX_SHOT_DIR or ./.shots/*.png
//
// Requires a real display (Windows/macOS desktop). Do NOT set
// ELECTRON_RUN_AS_NODE — the main bails out if it is set.

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const APP_DIR = path.resolve(__dirname, '..', '..', '..');
const MAIN = path.join(APP_DIR, 'dist', 'main', 'index.cjs');
const OUT = process.env.LUMOX_SHOT_DIR || path.join(APP_DIR, '.shots');
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(MAIN)) {
  console.error('[shot] build first: dist/main/index.cjs missing — run `node build.mjs`');
  process.exit(1);
}

// Force software compositing so capturePage() is reliable (GPU compositing
// intermittently throws UnknownVizError when the window isn't on-screen).
app.disableHardwareAcceleration();

// Boot the real app (registers IPC, seeds the demo show, creates the window).
require(MAIN);

const LOG = path.join(OUT, 'driver.log');
const step = (m) => { try { fs.appendFileSync(LOG, `${m}\n`); } catch {} console.log('[shot]', m); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (wc, code) => wc.executeJavaScript(code, true);

async function waitForWindow() {
  for (let i = 0; i < 160; i++) {
    const w = BrowserWindow.getAllWindows()[0];
    if (w && !w.webContents.isLoading()) return w;
    await sleep(250);
  }
  throw new Error('window never appeared');
}

async function waitFor(wc, expr, label, tries = 160) {
  for (let i = 0; i < tries; i++) {
    try { if (await js(wc, `!!(${expr})`)) return; } catch { /* page busy */ }
    await sleep(250);
  }
  throw new Error('timeout waiting for ' + (label || expr));
}

function attachDiagnostics(wc) {
  wc.on('console-message', (_e, level, message) => {
    if (level >= 2) step('renderer console[' + level + ']: ' + message);   // warnings + errors
  });
  wc.on('render-process-gone', (_e, d) => step('render-process-gone: ' + JSON.stringify(d)));
  wc.on('did-fail-load', (_e, code, desc) => step('did-fail-load: ' + code + ' ' + desc));
}

async function dumpState(wc) {
  try {
    const s = await js(wc, `JSON.stringify({
      lumox: !!window.lumox,
      workspace: !!document.querySelector('.workspace'),
      tiles: document.querySelectorAll('.tile').length,
      groupTabs: document.querySelectorAll('.gb-tabs .gb-tab').length,
      faderTile: !!document.querySelector('.fader-tile'),
      fcols: document.querySelectorAll('.fader-tile .fcol').length,
      tab: document.querySelector('.tb-tab.active')?.dataset.tab || null,
    })`);
    step('state: ' + s);
  } catch (e) { step('state dump failed: ' + e.message); }
}

const tileRect = `(() => { const e = document.querySelector('.fader-tile');
  if (!e) return null; const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`;

// capturePage can throw UnknownVizError until the window has composited a frame;
// retry a few times with the window shown/focused.
async function capture(win, rect) {
  for (let i = 0; i < 6; i++) {
    try {
      win.showInactive();
      const img = await win.webContents.capturePage(rect);
      if (img && img.getSize().width > 0) return img;
    } catch (e) { step('capture retry ' + i + ': ' + e.message); }
    await sleep(500);
  }
  throw new Error('capturePage failed after retries');
}

async function shoot(win, name, rectExpr) {
  let rect;
  if (rectExpr) {
    const r = await js(win.webContents, rectExpr);
    if (r && r.width > 1) rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }
  const img = await capture(win, rect);
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, img.toPNG());
  step('wrote ' + file);
}

app.whenReady().then(async () => {
  step('whenReady');
  const win = await waitForWindow();
  step('window ready');
  const wc = win.webContents;
  attachDiagnostics(wc);
  await sleep(800);

  await waitFor(wc, `document.querySelector('.fader-tile')`, 'fader tile');
  await waitFor(wc, `document.querySelector('.gb-tabs .gb-tab[data-grp]')`, 'group tabs');
  step('tiles mounted');

  // CONTROL tab → select a group that has intensity faders if possible, else the first real group
  await js(wc, `document.querySelector('.tb-tab[data-tab="control"]').click()`);
  await sleep(500);
  const group = await js(wc, `(async () => {
    const [groups, fixtures] = await Promise.all([window.lumox.groups.list(), window.lumox.patch.list()]);
    const byId = Object.fromEntries(fixtures.map((f) => [f.id, f]));
    let best = null, bestN = -1;
    for (const g of groups) {
      const rep = byId[g.fixtureIds[0]];
      const n = rep ? rep.channels.length : 0;
      if (n > bestN) { bestN = n; best = g; }
    }
    if (!best) return null;
    const tab = document.querySelector('.gb-tabs .gb-tab[data-grp="' + best.id + '"]');
    if (tab) tab.click();
    return best.name + ' (' + bestN + 'ch)';
  })()`);
  step('selected group: ' + group);

  // LIVE mode renders faders without needing an active scene (EDIT needs one).
  await js(wc, `(() => { const b = document.querySelector('.fader-head .seg-btn[data-mode="live"]'); if (b) b.click(); })()`);
  await waitFor(wc, `document.querySelector('.fader-tile .fcol')`, 'faders');
  await sleep(500);

  // 1) default attribute tab, clean
  await shoot(win, '01-fader-dimmer', tileRect);

  // 2) ALL tab (every channel type) + engage every other fader to show engage bars
  await js(wc, `(() => { const a = document.querySelector('.fader-tile .fe-attr[data-attr="all"]'); if (a) a.click(); })()`);
  await sleep(300);
  await js(wc, `(() => {
    const f = [...document.querySelectorAll('.fader-tile .fc-fader')];
    const v = [215, 150, 95, 185, 60, 120, 200, 40];
    f.forEach((el, i) => {
      if (i % 2 !== 0) return;            // engage every other fader so on/off is obvious
      el.value = v[(i / 2) % v.length];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  })()`);
  await sleep(600);
  await shoot(win, '02-fader-all-live', tileRect);

  // 3) whole CONTROL window for context
  await shoot(win, '03-control-window');

  step('done → ' + OUT);
  app.quit();
}).catch(async (err) => {
  step('FAILED: ' + (err && err.message ? err.message : err));
  try {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      await dumpState(w.webContents);
      fs.writeFileSync(path.join(OUT, 'error.png'), (await w.webContents.capturePage()).toPNG());
    }
  } catch { /* ignore */ }
  app.quit();
});
