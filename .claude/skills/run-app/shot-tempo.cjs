// F10 verification driver — boots the real app and screenshots the BPM source UI:
//   01-titlebar-manual  — titlebar clock, default 'manual' source (no chip)
//   02-settings-tempo   — Settings modal open at the Tempo source picker
//   03-titlebar-midi    — titlebar after switching source to MIDI (locked + chip)
// Run: node_modules/electron/dist/electron.exe .claude/skills/run-app/shot-tempo.cjs

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

app.disableHardwareAcceleration();
require(MAIN);

const LOG = path.join(OUT, 'driver-tempo.log');
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

async function waitFor(wc, expr, label, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { if (await js(wc, `!!(${expr})`)) return; } catch { /* page busy */ }
    await sleep(250);
  }
  throw new Error('timeout waiting for ' + (label || expr));
}

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
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  step('wrote ' + name + '.png' + (rect ? '' : ' (full window)'));
}

// Header region (titlebar) with a little padding so the BPM clock + chip are clear.
const headerRect = `(() => { const e = document.querySelector('header'); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`;
const modalRect = `(() => { const e = document.querySelector('.lx-modal'); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 }; })()`;

app.whenReady().then(async () => {
  step('whenReady');
  const win = await waitForWindow();
  const wc = win.webContents;
  wc.on('console-message', (_e, level, message) => { if (level >= 2) step('renderer[' + level + ']: ' + message); });
  await sleep(900);
  await waitFor(wc, `document.getElementById('bpm-clock')`, 'bpm clock');

  // 1) titlebar, manual source (default — chip hidden)
  await shoot(win, '01-titlebar-manual', headerRect);

  // 2) open Settings (Ctrl+,) and capture the Tempo section
  await js(wc, `window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }))`);
  await waitFor(wc, `[...document.querySelectorAll('.lx-form-head')].some(h => h.textContent === 'Tempo')`, 'Tempo section');
  await sleep(400);
  await shoot(win, '02-settings-tempo', modalRect);

  // close the modal
  await js(wc, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(300);

  // 3) switch source to MIDI → titlebar locks + shows the source chip
  const status = await js(wc, `window.lumox.transport.setSource('midi', null)`);
  step('setSource(midi) → ' + JSON.stringify(status));
  await sleep(500);
  await shoot(win, '03-titlebar-midi', headerRect);

  // restore manual so we leave settings.json clean for the next run
  await js(wc, `window.lumox.transport.setSource('manual')`);
  await sleep(200);

  step('done → ' + OUT);
  app.quit();
}).catch(async (err) => {
  step('FAILED: ' + (err && err.message ? err.message : err));
  try {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) fs.writeFileSync(path.join(OUT, 'error-tempo.png'), (await w.webContents.capturePage()).toPNG());
  } catch { /* ignore */ }
  app.quit();
});
