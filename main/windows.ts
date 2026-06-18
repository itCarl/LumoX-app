// Window management — owns the main + fixture-editor BrowserWindows and the
// security hardening applied to every window. Handlers reach the main window
// via getMainWindow().

import { BrowserWindow } from 'electron';
import path from 'node:path';

// Built main lives at dist/main/index.cjs; repo root is two levels up. Static
// assets (fixtures/, renderer/) stay at the repo root, not under dist/.
// `__dirname` is the native CJS runtime value (CJS bundle output).
export const APP_ROOT = path.join(__dirname, '..', '..');
const PRELOAD = path.join(__dirname, '..', 'preload.cjs');

let mainWindow: BrowserWindow | null = null;
let editorWindow: BrowserWindow | null = null;

export const getMainWindow = (): BrowserWindow | null => mainWindow;

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
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
}

export function openEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) { editorWindow.focus(); return; }
  editorWindow = new BrowserWindow({
    width: 600, height: 660,
    minWidth: 460, minHeight: 420,
    parent: mainWindow ?? undefined,
    frame: false,
    backgroundColor: '#232323',
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
