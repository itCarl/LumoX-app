// F2 verification — per-fixture limits actually clamp the engine output, and the
// Limits modal renders. Boots the real main (seeded demo rig), drives a mover via
// the live programmer to full, applies limits, and reads the universe buffer back.
//
//   node_modules/electron/dist/electron.exe .claude/skills/run-app/shot-limits.cjs

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

const LOG = path.join(OUT, 'driver-limits.log');
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
  await sleep(800);
  await waitFor(wc, `window.lumox && document.querySelector('.pg-tile')`, 'patch grid');

  // Numeric engine test: pick a mover (has pan + tilt + dimmer), push all to full
  // via the live programmer, apply limits, then read the universe buffer back.
  const result = await js(wc, `(async () => {
    const fixtures = await window.lumox.patch.list();
    const find = (f, t) => (f.channels.find((c) => c.typeId === t) || {}).index || 0;
    const intens = (f) => (f.channels.find((c) => ['intensity','intensity-master','dimmer'].includes(c.typeId)) || {}).index || 0;
    const fx = fixtures.find((f) => find(f, 'pan') && find(f, 'tilt') && intens(f));
    if (!fx) return { err: 'no mover with pan+tilt+dimmer found' };
    const panI = find(fx, 'pan'), tiltI = find(fx, 'tilt'), dimI = intens(fx);
    const addr = (i) => fx.startAddress + i - 1;
    // drive to full
    await window.lumox.fixtures.setChannel(fx.id, panI, 255);
    await window.lumox.fixtures.setChannel(fx.id, tiltI, 255);
    await window.lumox.fixtures.setChannel(fx.id, dimI, 255);
    await new Promise((r) => setTimeout(r, 120));
    const before = await window.lumox.universes.read(fx.universeId);
    // apply limits: dimmer cap 100, tilt max 60, pan invert
    await window.lumox.fixtures.setLimits([fx.id], { dimmer: { max: 100 }, tilt: { min: 0, max: 60 }, pan: { min: 0, max: 255, invert: true } });
    await new Promise((r) => setTimeout(r, 120));
    const after = await window.lumox.universes.read(fx.universeId);
    return {
      name: fx.name,
      dim:  { addr: addr(dimI),  before: before[addr(dimI)-1],  after: after[addr(dimI)-1] },
      tilt: { addr: addr(tiltI), before: before[addr(tiltI)-1], after: after[addr(tiltI)-1] },
      pan:  { addr: addr(panI),  before: before[addr(panI)-1],  after: after[addr(panI)-1] },
    };
  })()`);
  step('result: ' + JSON.stringify(result));
  if (result && !result.err) {
    const ok = result.dim.after <= 100 && result.tilt.after <= 60 && result.pan.after <= 10;
    step('CLAMP ' + (ok ? 'PASS' : 'FAIL') + ' (dimmer<=100, tilt<=60, pan inverted~0)');
  }

  // Screenshot the modal: open it from the patch-grid fixture menu.
  await js(wc, `document.querySelector('.tb-tab[data-tab="setup"]').click()`);
  await sleep(300);
  await js(wc, `(async () => {
    const fixtures = await window.lumox.patch.list();
    const fx = fixtures.find((f) => f.channels.some((c) => c.typeId === 'pan'));
    const cell = document.querySelector('.pg-tile .cell.fx[data-fx="' + fx.id + '"]');
    if (cell) cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }));
  })()`);
  await sleep(400);
  // click the "Limits…" menu item
  const opened = await js(wc, `(() => {
    const items = [...document.querySelectorAll('.menu-item, .lx-menu-item, [role="menuitem"], button, div')];
    const it = items.find((e) => e.textContent && e.textContent.trim() === 'Limits…');
    if (it) { it.click(); return true; }
    return false;
  })()`);
  step('limits menu item clicked: ' + opened);
  await sleep(700);
  const hasModal = await js(wc, `!!document.querySelector('.lx-modal-backdrop')`);
  step('modal present: ' + hasModal);
  await shoot(win, 'limits-modal', '.lx-modal-backdrop');

  step('done → ' + OUT);
  app.quit();
}).catch(async (err) => {
  step('FAILED: ' + (err && err.message ? err.message : err));
  app.quit();
});
