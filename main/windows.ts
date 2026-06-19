// Window management — owns the main + fixture-editor BrowserWindows and the
// security hardening applied to every window. Handlers reach the main window
// via getMainWindow().

import { BrowserWindow } from 'electron';
import path from 'node:path';
import { midiService } from './services/MidiService';

// Built main lives at dist/main/index.cjs; repo root is two levels up. Static
// assets (fixtures/, renderer/) stay at the repo root, not under dist/.
// `__dirname` is the native CJS runtime value (CJS bundle output).
export const APP_ROOT = path.join(__dirname, '..', '..');
const PRELOAD = path.join(__dirname, '..', 'preload.cjs');

// App icon (window + taskbar). Generated from assets/icon.svg via `npm run icons`.
// Windows wants .ico; other platforms take the PNG (macOS ignores it — its dock
// icon comes from the packaged .app bundle).
const ICON = path.join(APP_ROOT, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

let mainWindow: BrowserWindow | null = null;
let editorWindow: BrowserWindow | null = null;
let midiWindow: BrowserWindow | null = null;

export const getMainWindow = (): BrowserWindow | null => mainWindow;

// A guard consulted before the main window closes. Returns true to proceed
// (saved / discarded), false to abort. Injected by the project handler so this
// module stays free of dialog/save logic.
let closeGuard: (() => Promise<boolean>) | null = null;
export function setCloseGuard(fn: () => Promise<boolean>): void { closeGuard = fn; }

// Lock a window down: refuse to open child windows and block navigation away
// from the bundled local content (defence-in-depth on top of CSP + isolation).
function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

export function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    frame: false,                 // custom titlebar (renderer draws the chrome)
    backgroundColor: '#1a1a1a',
    icon: ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;
  hardenWindow(win);
  win.maximize();   // always start full screen
  win.loadFile(path.join(APP_ROOT, 'renderer', 'index.html'));

  // Tell the renderer when maximize state flips so it can swap the icon.
  const sendMax = () => win.webContents.send('win:maximized', win.isMaximized());
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

  // Confirm discard of unsaved changes before the window actually closes. The
  // guard runs async (native dialog), so veto the close, ask, then re-close if
  // approved. `confirmedClose` stops the re-close from re-prompting.
  let confirmedClose = false;
  win.on('close', (e) => {
    if (confirmedClose || !closeGuard) return;
    e.preventDefault();
    closeGuard().then((proceed) => { if (proceed) { confirmedClose = true; win.close(); } });
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
}

export function openEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) { editorWindow.focus(); return; }
  // No `parent` — a parented child window shares the main window's taskbar
  // button on Windows. A top-level window gets its own entry so the user can
  // pick the editor from the taskbar / alt-tab independently.
  editorWindow = new BrowserWindow({
    width: 860, height: 720,
    minWidth: 640, minHeight: 560,
    frame: false,
    backgroundColor: '#232323',
    icon: ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  hardenWindow(editorWindow);
  editorWindow.loadFile(path.join(APP_ROOT, 'renderer', 'fixtureeditor.html'));
  editorWindow.on('closed', () => { editorWindow = null; });
}

export function openMidiWindow(): void {
  if (midiWindow && !midiWindow.isDestroyed()) { midiWindow.focus(); return; }
  // Top-level (no `parent`) so it gets its own taskbar entry — same rationale as
  // the fixture editor: the user can pick the MIDI mapping window independently.
  midiWindow = new BrowserWindow({
    width: 860, height: 640,
    minWidth: 680, minHeight: 480,
    frame: false,
    backgroundColor: '#232323',
    icon: ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  hardenWindow(midiWindow);
  midiWindow.loadFile(path.join(APP_ROOT, 'renderer', 'midi.html'));
  // End assign mode when the window closes, else the main window's assign overlay
  // (purple-washed controls) would stay stuck on with no window to cancel it.
  midiWindow.on('closed', () => { midiWindow = null; midiService.cancelAssign(); });
}

// ---- generic dialog window (replaces in-app modals) ---------------------
// A small frameless top-level window (own taskbar entry) that hosts a button
// prompt or notice; the spec + result round-trip lives in handlers/dialog.ts.
let dialogWindow: BrowserWindow | null = null;
export function openDialogWindow(width: number, height: number, onClosed: () => void): void {
  if (dialogWindow && !dialogWindow.isDestroyed()) { dialogWindow.focus(); return; }
  dialogWindow = new BrowserWindow({
    width, height,
    resizable: false, minimizable: false, maximizable: false,
    frame: false,
    backgroundColor: '#232323',
    icon: ICON,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  hardenWindow(dialogWindow);
  dialogWindow.loadFile(path.join(APP_ROOT, 'renderer', 'dialog.html'));
  dialogWindow.on('closed', () => { dialogWindow = null; onClosed(); });
}
export function closeDialogWindow(): void {
  if (dialogWindow && !dialogWindow.isDestroyed()) dialogWindow.close();
}

// ---- generic panel window (Settings, group order) -----------------------
// A frameless top-level window (own taskbar entry) hosting a richer panel; the
// panel spec is stored in handlers/panel.ts and fetched by the page on load.
let panelWindow: BrowserWindow | null = null;
export function openPanelWindow(width: number, height: number): void {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();   // replace any open panel
  panelWindow = new BrowserWindow({
    width, height,
    minWidth: 360, minHeight: 320,
    frame: false,
    backgroundColor: '#232323',
    icon: ICON,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  hardenWindow(panelWindow);
  panelWindow.loadFile(path.join(APP_ROOT, 'renderer', 'panel.html'));
  panelWindow.on('closed', () => { panelWindow = null; });
}
