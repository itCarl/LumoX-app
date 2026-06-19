// Limits tile (SETUP bottom-right) screenshot — selects a mover so the pan/tilt
// range box, dimmer-cap bar, and channel-flag pills all render.

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const APP_DIR = path.resolve(__dirname, '..', '..', '..');
const MAIN = path.join(APP_DIR, 'dist', 'main', 'index.cjs');
const OUT = process.env.LUMOX_SHOT_DIR || path.join(APP_DIR, '.shots');
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(MAIN)) { console.error('build first'); process.exit(1); }
app.disableHardwareAcceleration();
require(MAIN);

const step = (m) => console.log('[shot]', m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (wc, code) => wc.executeJavaScript(code, true);
async function waitForWindow() { for (let i = 0; i < 160; i++) { const w = BrowserWindow.getAllWindows()[0]; if (w && !w.webContents.isLoading()) return w; await sleep(250); } throw new Error('no window'); }
async function waitFor(wc, e, l, t = 160) { for (let i = 0; i < t; i++) { try { if (await js(wc, `!!(${e})`)) return; } catch {} await sleep(250); } throw new Error('timeout ' + l); }
async function capture(win, rect) { for (let i = 0; i < 6; i++) { try { win.showInactive(); const img = await win.webContents.capturePage(rect); if (img && img.getSize().width > 0) return img; } catch {} await sleep(500); } throw new Error('cap fail'); }
async function shoot(win, name, sel) { let rect; if (sel) { const r = await js(win.webContents, `(()=>{const e=document.querySelector('${sel}');if(!e)return null;const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};})()`); if (r && r.width > 1) rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; } const img = await capture(win, rect); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); step('wrote ' + name); }

app.whenReady().then(async () => {
  const win = await waitForWindow();
  const wc = win.webContents;
  await sleep(800);
  await waitFor(wc, `window.lumox && document.querySelector('.limits-tile')`, 'limits tile');
  await js(wc, `document.querySelector('.tb-tab[data-tab="setup"]').click()`);
  await sleep(300);
  // pre-set limits, then select the mover by clicking its patch cell (the real
  // path — emits EV.FIXTURE_SELECTED, which the tile reacts to).
  const n = await js(wc, `(async () => {
    const fixtures = await window.lumox.patch.list();
    const fx = fixtures.find((f) => f.channels.some((c) => c.typeId === 'pan') && f.channels.some((c) => c.typeId === 'tilt'));
    if (!fx) return 0;
    await window.lumox.fixtures.setLimits([fx.id], { dimmer:{max:180}, pan:{min:40,max:210,invert:false}, tilt:{min:20,max:150,invert:true} });
    const cell = document.querySelector('.pg-tile .cell.fx[data-fx="' + fx.id + '"]');
    if (cell) cell.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    return cell ? 1 : 0;
  })()`);
  step('selected mover: ' + n);
  await sleep(500);
  await shoot(win, 'limits-tile', '.limits-tile');
  await shoot(win, 'limits-tile-window', '#st-canvas, .workspace');
  step('done');
  app.quit();
}).catch((e) => { step('FAILED: ' + (e && e.message ? e.message : e)); app.quit(); });
