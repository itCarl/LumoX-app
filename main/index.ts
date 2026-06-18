// Electron main — thin shell. Boots the headless engine (src/), opens the
// window, and wires the IPC surface. The work lives in:
//   context.ts      engine/show/bank singletons + domain helpers
//   windows.ts      BrowserWindow lifecycle + hardening
//   serializers.ts  engine → DTO mappers (dto.ts)
//   handlers/*      one module per `lumox:<area>` IPC group
//   services/*      ProjectService (save/load)
//
// This module is bundled to CommonJS (dist/main/index.cjs), so esbuild compiles
// the named electron import straight to `require('electron').app` etc.

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { setLogLevel } from '../src/index';
import { engine, show, banks, setBroadcastOutput, NO_UNIVERSE } from './context';
import { APP_ROOT, createWindow } from './windows';
import { registerHandlers } from './handlers';

// Fail fast if Electron is running as plain Node. With ELECTRON_RUN_AS_NODE set,
// electron.exe behaves like node and `require('electron')` returns the binary
// path string instead of the API — so `app`/`ipcMain` are undefined and the
// next IPC call dies with a cryptic "Cannot read properties of undefined". Make
// the real cause obvious instead.
if (!app || !ipcMain) {
  console.error(
    '[main] Electron API unavailable — `electron` resolved to a path, not the ' +
    'API. This happens when ELECTRON_RUN_AS_NODE is set in the environment. ' +
    'Unset it before launching the app (it is set by some tool harnesses).',
  );
  process.exit(1);
}

setLogLevel('info');

// Hold reference globally so dev tools can poke at it. Dev builds only —
// don't leak engine internals into the global scope in production.
if (process.env.NODE_ENV === 'development') {
  globalThis.lumox = { engine, show };
}

registerHandlers();

// Load the built-in fixture library, then ensure default universes + bank so
// the UI has something to draw on first launch, then open the broadcast output.
const FIXTURES_DIR = path.join(APP_ROOT, 'fixtures');
async function bootShow(): Promise<void> {
  try {
    const r = await show.library.loadFromDirectory(FIXTURES_DIR, { source: 'builtin' });
    console.log(`[show] library: ${r.loaded} loaded, ${r.skipped} skipped, ${r.errors.length} errors`);
  } catch (err) {
    console.error('[show] library load failed:', (err as Error).message);
  }
  // Make 10 universes available by default (no manual add in the UI).
  for (let i = 0; i < 10; i++) engine.universes.ensure(i, `Universe ${i + 1}`);
  banks.ensureDefault();

  // Broadcast Art-Net — but only on universes that have an active scene. An
  // empty subscription set would mean "all", so subscribe to a sentinel id.
  try {
    const broadcast = engine.outputs.create('artnet', {
      name: 'Broadcast', host: '255.255.255.255', maxRateHz: 40,
      subscribedUniverses: [NO_UNIVERSE],
    });
    setBroadcastOutput(broadcast);
    await broadcast.open();
    console.log('[show] Art-Net broadcast output open');
  } catch (err) {
    console.error('[show] Art-Net broadcast failed:', (err as Error).message);
  }
}

// ---- app lifecycle -----------------------------------------------------
// Last-resort guards — log instead of dying silently. An unhandled error in an
// async IPC handler or a stray socket callback shouldn't take the app down with
// a cryptic stack and no context.
process.on('uncaughtException', (err) => console.error('[main] uncaughtException:', err));
process.on('unhandledRejection', (reason) => console.error('[main] unhandledRejection:', reason));

app.whenReady().then(async () => {
  await bootShow();
  engine.start();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('[main] startup failed:', err);
  app.quit();
});

// Idempotent teardown — stop the tick loop, then close every output socket
// (Art-Net / sACN). Guarded so the multiple shutdown paths below run it once.
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    engine.stop();
    await engine.outputs.closeAll();
    console.log('[shutdown] outputs closed');
  } catch (err) {
    console.error('[shutdown] error:', (err as Error).message);
  }
}

// Closing the last window quits (except macOS, where apps stay resident).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Canonical quit path (window close, menu Quit, Cmd+Q, app.quit()). Hold the
// quit until outputs are closed, then let it proceed.
app.on('before-quit', (e) => {
  if (shuttingDown) return;     // second pass — allow quit to complete
  e.preventDefault();
  shutdown().finally(() => app.quit());
});

// Dev / signal kills (Ctrl-C from `npm start`, OS terminate).
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => shutdown().finally(() => process.exit(0)));
}
