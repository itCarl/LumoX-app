// Electron main — thin shell. Boots the headless engine (src/), opens the
// window, and wires the IPC surface. The work lives in:
//   context.ts      engine/show/bank singletons + tiny pure helpers (a leaf)
//   windows.ts      BrowserWindow lifecycle + hardening
//   serializers.ts  engine → DTO mappers (dto.ts)
//   handlers/*      one module per `lumox:<area>` IPC group
//   services/*      show-domain logic — SceneCompiler, SceneOrchestrator,
//                   OutputPatchService, SelectionService, FixtureMaps, Project…;
//                   showRuntime.wireShowRuntime() composes the per-tick runtime
//
// This module is bundled to CommonJS (dist/main/index.cjs), so esbuild compiles
// the named electron import straight to `require('electron').app` etc.

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { setLogLevel } from '../src/index';
import { engine, show, discovery } from './context';
import { blackoutAllOutputs } from './services/OutputPatchService';
import { wireShowRuntime } from './services/showRuntime';
import { APP_ROOT, createWindow, getMainWindow } from './windows';
import { registerHandlers } from './handlers';
import { newProject, loadProjectFromPath, setProject } from './services/ProjectService';
import { resetHistory } from './services/HistoryService';
import { loadSettings, getSetting } from './services/SettingsService';
import { loadUserLibrary } from './services/UserLibraryService';
import { transport } from './services/Transport';
import { midiService } from './services/MidiService';

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

// Enforce a single running instance: two controllers would fight over the same
// Art-Net / sACN output sockets and the MIDI device. A second launch just hands
// focus to the existing window and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

setLogLevel('info');

// Hold reference globally so dev tools can poke at it. Dev builds only —
// don't leak engine internals into the global scope in production.
if (process.env.NODE_ENV === 'development') {
  globalThis.lumox = { engine, show };
}

registerHandlers();
wireShowRuntime();   // per-tick scene runtime + selection-change hook (before engine.start)

// Load the built-in fixture library, then ensure default universes + bank so
// the UI has something to draw on first launch, then open the broadcast output.
const FIXTURES_DIR = path.join(APP_ROOT, 'fixtures');
async function bootShow(): Promise<void> {
  await loadSettings();   // app preferences (needs app ready for userData path)
  await transport.init(); // adopt the persisted BPM source (after settings load)

  // The bundled library (hundreds of files) is lazy-loaded per vendor — register
  // the root here; vendors parse on demand (accordion open / patch / project load
  // / search). See FixtureLibrary.ensureVendor.
  show.library.setBuiltinRoot(FIXTURES_DIR);

  // User-authored fixtures (the "Custom" vendor) persisted under userData are few,
  // so load them eagerly so they're always available without opening a project.
  await loadUserLibrary();

  // Boot project: reopen the last project when enabled in Settings; otherwise in
  // development open a bundled demo show for quick testing, while packaged builds
  // start blank. Two demos ship under resources/: `demo-show-0.lmx` (a synthetic
  // rig with banks + scenes of every FX type) and `demo-show-1.lmx` (a real
  // wedding rig ported from a QLC+ workspace — 12 fixtures, groups, static scenes
  // + chases). Dev seeds Demo Show 1. Override with LUMOX_SEED=1 (force demo) /
  // LUMOX_SEED=0 (force blank).
  let restored = false;
  const last = getSetting('lastProjectPath');
  if (getSetting('reopenLastProject') && last) {
    try { await loadProjectFromPath(last); restored = true; console.log(`[show] reopened ${last}`); }
    catch (err) { console.error('[show] reopen last project failed:', (err as Error).message); }
  }
  if (!restored) {
    const seed = process.env.LUMOX_SEED === '1' || (process.env.LUMOX_SEED !== '0' && !app.isPackaged);
    if (seed) {
      try {
        await loadProjectFromPath(path.join(APP_ROOT, 'resources', 'demo-show-1.lmx'));
        setProject('Demo Show 1', null);   // scratch copy — a stray Save won't clobber the bundled file
      } catch (err) {
        console.error('[show] demo show load failed:', (err as Error).message);
        newProject();
      }
    } else {
      newProject();
    }
  }
  // Per-universe outputs are seeded by newProject and applied by a project load
  // (ProjectService) — nothing more to do here.

  resetHistory();   // baseline undo/redo on the freshly-booted show
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
  // Connect a MIDI control surface in the background (APC Mini MK2). Stays
  // "disconnected" with no device / no easymidi backend — never blocks startup.
  midiService.connect().catch((err) => console.error('[midi] connect failed:', (err as Error).message));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('[main] startup failed:', err);
  app.quit();
});

// Idempotent teardown — stop the tick loop, blackout every fixture (so nothing
// stays lit once we stop transmitting), then close every output socket (Art-Net
// / sACN). Stopping the tick first means our blackout frames are the only thing
// touching the sockets. Guarded so the multiple shutdown paths below run once.
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    engine.stop();
    await discovery.stop();
    await blackoutAllOutputs();
    await engine.outputs.closeAll();
    console.log('[shutdown] blackout sent, outputs closed');
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
