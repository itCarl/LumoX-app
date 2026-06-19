// Shared driver harness for the Lumox screenshot scenarios. Boots the REAL main
// process (dist/main/index.cjs) — which on a dev launch seeds the demo rig — and
// hands a scenario a small toolkit (js / shoot / waitFor / dev) to drive the
// renderer and capture PNGs via webContents.capturePage(). One place for the
// boilerplate that used to be copy-pasted into every shot-*.cjs.
//
// A scenario is a module: `{ cover?: string, async run(ctx) }`. See ./scenarios/.

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const APP_DIR = path.resolve(__dirname, '..', '..', '..');
const MAIN = path.join(APP_DIR, 'dist', 'main', 'index.cjs');
const OUT = process.env.LUMOX_SHOT_DIR || path.join(APP_DIR, '.shots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A scenario that edits the show makes it dirty, so quitting fires the
// unsaved-changes prompt — a custom frameless window (renderer/dialog.html), NOT
// a native showMessageBox. With no human to click it, the close would hang.
// Auto-press it: when a dialog window finishes loading, click "Don't Save"
// (discard) once its buttons render; fall back to the danger/last button for any
// other prompt so nothing blocks. (A fresh boot is clean, so this is a no-op
// unless a scenario dirtied the project.)
function autoDismissDialogs() {
  app.on('browser-window-created', (_e, w) => {
    w.webContents.on('did-finish-load', async () => {
      let url = '';
      try { url = w.webContents.getURL(); } catch { return; }
      if (!url.endsWith('dialog.html')) return;     // only the generic dialog window
      try {
        const id = await w.webContents.executeJavaScript(`(async () => {
          for (let i = 0; i < 40; i++) {
            const b = document.querySelector('button[data-id="dont-save"]')
                   || document.querySelector('#dlg-foot .lx-btn-danger')
                   || document.querySelector('#dlg-foot button:last-child');
            if (b) { b.click(); return b.dataset.id || b.textContent; }
            await new Promise((r) => setTimeout(r, 50));
          }
          return null;
        })()`, true);
        console.log('[shot] auto-pressed close dialog: ' + id);
      } catch (e) { console.log('[shot] dialog dismiss failed: ' + e.message); }
    });
  });
}

/** Boot the real app (must run before app.whenReady). Forces software
 *  compositing so capturePage() is reliable off-screen, then loads main. */
function boot() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(MAIN)) {
    console.error('[shot] build first: dist/main/index.cjs missing — run `node build.mjs`');
    process.exit(1);
  }
  app.disableHardwareAcceleration();
  autoDismissDialogs();
  require(MAIN);
}

/** A per-scenario step logger → console + .shots/<name>.log. */
function makeStep(logName) {
  const LOG = path.join(OUT, logName);
  return (m) => { try { fs.appendFileSync(LOG, m + '\n'); } catch { /* ignore */ } console.log('[shot]', m); };
}

async function waitForWindow() {
  for (let i = 0; i < 160; i++) {
    const w = BrowserWindow.getAllWindows()[0];
    if (w && !w.webContents.isLoading()) return w;
    await sleep(250);
  }
  throw new Error('window never appeared');
}

function attachDiagnostics(wc, step) {
  wc.on('console-message', (_e, level, message) => { if (level >= 2) step('renderer console[' + level + ']: ' + message); });
  wc.on('render-process-gone', (_e, d) => step('render-process-gone: ' + JSON.stringify(d)));
  wc.on('did-fail-load', (_e, code, desc) => step('did-fail-load: ' + code + ' ' + desc));
}

// capturePage can throw UnknownVizError until the window has composited a frame;
// retry with the window shown/focused.
async function capture(win, rect, step) {
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

/** Build the toolkit a scenario receives. */
function makeCtx(win, step) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);

  async function waitFor(expr, label, tries = 160) {
    for (let i = 0; i < tries; i++) {
      try { if (await js(`!!(${expr})`)) return; } catch { /* page busy */ }
      await sleep(250);
    }
    throw new Error('timeout waiting for ' + (label || expr));
  }

  // Capture a screenshot. `sel` is a CSS selector (clipped to that element's
  // box, with optional `pad` px around it); omit it for the whole window.
  async function shoot(name, sel, pad = 0) {
    let rect;
    if (sel) {
      const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
        if (!e) return null; const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`);
      if (r && r.width > 1) {
        rect = { x: Math.round(r.x - pad), y: Math.round(r.y - pad), width: Math.round(r.width + pad * 2), height: Math.round(r.height + pad * 2) };
      } else {
        step('shoot ' + name + ': selector ' + sel + ' not found — full window');
      }
    }
    const img = await capture(win, rect, step);
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
    step('wrote ' + name + '.png');
  }

  // Run code in the MAIN process (engine/show internals) via the dev bridge.
  // Requires LUMOX_DEV=1 (the shot wrapper sets it). Returns the JSON result.
  async function dev(code) {
    return js(`window.lumox.dev.eval(${JSON.stringify(code)})`);
  }

  return { win, wc, OUT, step, sleep, js, waitFor, shoot, dev };
}

/** Boot → wait for window → run one scenario → quit. Captures an error.png +
 *  state dump on failure so a blank/failed run is diagnosable. */
function run(scenario, logName) {
  const step = makeStep(logName);
  app.whenReady().then(async () => {
    step('whenReady');
    const win = await waitForWindow();
    const ctx = makeCtx(win, step);
    attachDiagnostics(win.webContents, step);
    await sleep(800);
    step('window ready');
    await scenario.run(ctx);
    step('done → ' + OUT);
    app.quit();
  }).catch(async (err) => {
    step('FAILED: ' + (err && err.message ? err.message : err));
    try {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) {
        const img = await w.webContents.capturePage();
        fs.writeFileSync(path.join(OUT, logName.replace(/\.log$/, '') + '-error.png'), img.toPNG());
      }
    } catch { /* ignore */ }
    app.quit();
  });
}

/** Composite hero shots into one contact-sheet PNG, dependency-free: build an
 *  HTML grid of file:// images in a hidden window and capture it. */
function montage(entries, outName, step) {
  app.whenReady().then(async () => {
    const present = entries.filter((e) => fs.existsSync(path.join(OUT, e.file + '.png')));
    if (!present.length) { step('montage: no cover shots found in ' + OUT); app.quit(); return; }
    const cells = present.map((e) => {
      const src = 'file://' + path.join(OUT, e.file + '.png').replace(/\\/g, '/');
      return `<figure><img src="${src}"><figcaption>${e.label}</figcaption></figure>`;
    }).join('');
    const html = `<!doctype html><meta charset="utf8"><style>
      body{margin:0;background:#15161a;font:13px system-ui;color:#cdd}
      main{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:14px}
      figure{margin:0;background:#1d1f24;border-radius:8px;overflow:hidden}
      img{display:block;width:100%;height:auto}
      figcaption{padding:6px 10px;color:#9aa}</style>
      <main>${cells}</main>`;
    const w = new BrowserWindow({ width: 1280, height: 1600, show: false, webPreferences: { webSecurity: false } });
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await sleep(700);
    const full = await w.webContents.executeJavaScript(`document.querySelector('main').scrollHeight`);
    w.setContentSize(1280, Math.min(4000, Math.max(400, Math.ceil(full))));
    await sleep(300);
    const img = await capture(w, undefined, step);
    fs.writeFileSync(path.join(OUT, outName + '.png'), img.toPNG());
    step('wrote ' + outName + '.png (' + present.length + ' cells)');
    app.quit();
  }).catch((err) => { step('montage FAILED: ' + err.message); app.quit(); });
}

module.exports = { APP_DIR, OUT, boot, run, montage, sleep };
