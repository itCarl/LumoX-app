// F1 (group order) + F2 (channel flags) verification. Numeric checks for the
// engine follows-dimmer scale, plus screenshots of the group-order and limits modals.

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

const LOG = path.join(OUT, 'driver-f1f2.log');
const step = (m) => { try { fs.appendFileSync(LOG, m + '\n'); } catch {} console.log('[shot]', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (wc, code) => wc.executeJavaScript(code, true);

async function waitForWindow() {
  for (let i = 0; i < 160; i++) { const w = BrowserWindow.getAllWindows()[0]; if (w && !w.webContents.isLoading()) return w; await sleep(250); }
  throw new Error('no window');
}
async function waitFor(wc, expr, label, tries = 160) {
  for (let i = 0; i < tries; i++) { try { if (await js(wc, `!!(${expr})`)) return; } catch {} await sleep(250); }
  throw new Error('timeout ' + (label || expr));
}
async function capture(win, rect) {
  for (let i = 0; i < 6; i++) {
    try { win.showInactive(); const img = await win.webContents.capturePage(rect); if (img && img.getSize().width > 0) return img; }
    catch (e) { step('cap retry ' + i + ': ' + e.message); }
    await sleep(500);
  }
  throw new Error('capture failed');
}
async function shoot(win, name, sel) {
  let rect;
  if (sel) { const r = await js(win.webContents, `(()=>{const e=document.querySelector('${sel}');if(!e)return null;const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};})()`); if (r && r.width > 1) rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; }
  const img = await capture(win, rect);
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  step('wrote ' + name + '.png');
}

app.whenReady().then(async () => {
  const win = await waitForWindow();
  const wc = win.webContents;
  await sleep(800);
  await waitFor(wc, `window.lumox && document.querySelector('.pg-tile')`, 'patch grid');

  // ---- F2 numeric: follows-dimmer scales a colour channel by the dimmer ----
  const r = await js(wc, `(async () => {
    const fixtures = await window.lumox.patch.list();
    const idx = (f, t) => (f.channels.find((c) => c.typeId === t) || {}).index || 0;
    const dimIdx = (f) => { const c = f.channels.find((c) => ['intensity','intensity-master','dimmer'].includes(c.typeId)); return c ? c.index : 0; };
    const fx = fixtures.find((f) => idx(f, 'red') && dimIdx(f));
    if (!fx) return { err: 'no rgb+dimmer fixture' };
    const redI = idx(fx, 'red'), dI = dimIdx(fx);
    const abs = (i) => fx.startAddress + i - 1;
    await window.lumox.fixtures.setChannel(fx.id, redI, 255);   // red full
    await window.lumox.fixtures.setChannel(fx.id, dI, 128);     // dimmer 50%
    await new Promise((r) => setTimeout(r, 120));
    const before = (await window.lumox.universes.read(fx.universeId))[abs(redI) - 1];
    await window.lumox.fixtures.setChannelFlag([fx.id], redI, 'dimmer', true);   // red follows dimmer
    await new Promise((r) => setTimeout(r, 120));
    const after = (await window.lumox.universes.read(fx.universeId))[abs(redI) - 1];
    return { name: fx.name, redBefore: before, redAfter: after, expected: Math.round(255 * 128 / 255) };
  })()`);
  step('follows-dimmer: ' + JSON.stringify(r));
  if (r && !r.err) step('FOLLOWS-DIMMER ' + (Math.abs(r.redAfter - r.expected) <= 2 ? 'PASS' : 'FAIL') + ` (red ${r.redBefore}→${r.redAfter}, expected ~${r.expected})`);

  // ---- F1: open the group-order editor from the group bar ----
  await js(wc, `document.querySelector('.tb-tab[data-tab="setup"]').click()`);
  await sleep(300);
  const gOpened = await js(wc, `(async () => {
    const groups = await window.lumox.groups.list();
    const g = groups.find((x) => x.fixtureIds.length > 1) || groups[0];
    if (!g) return false;
    const tab = document.querySelector('.gb-tab[data-grp="' + g.id + '"]');
    if (!tab) return false;
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 300 }));
    await new Promise((r) => setTimeout(r, 250));
    const it = [...document.querySelectorAll('.ctx-menu [data-mi]')].find((e) => e.textContent.trim().startsWith('Edit order'));
    if (it) { it.click(); return true; }
    return false;
  })()`);
  step('group-order opened: ' + gOpened);
  await sleep(500);
  await shoot(win, 'f1-group-order', '.lx-modal-backdrop');
  await js(wc, `document.querySelector('.lx-modal-backdrop')?.remove()`);
  await sleep(150);

  // ---- F2: open the limits modal (now with a Channels section) ----
  await js(wc, `(async () => {
    const fixtures = await window.lumox.patch.list();
    const fx = fixtures.find((f) => f.channels.some((c) => c.typeId === 'pan')) || fixtures[0];
    const cell = document.querySelector('.pg-tile .cell.fx[data-fx="' + fx.id + '"]');
    if (cell) cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }));
    await new Promise((r) => setTimeout(r, 250));
    const it = [...document.querySelectorAll('.ctx-menu [data-mi]')].find((e) => e.textContent.trim() === 'Limits…');
    if (it) it.click();
  })()`);
  await sleep(500);
  await shoot(win, 'f2-limits-channels', '.lx-modal-backdrop');

  step('done');
  app.quit();
}).catch(async (e) => { step('FAILED: ' + (e && e.message ? e.message : e)); app.quit(); });
