// Electron main — placeholder. UI not built yet; engine boots headless-style
// and exposes itself for future IPC. Keep this thin.

import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Engine, OutputManager, setLogLevel } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
setLogLevel('info');

const engine = new Engine({ refreshHz: 44 });
// Hold reference globally so renderer-side dev tools can poke at it later.
globalThis.lumox = { engine };

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// ---- minimal IPC surface — fleshed out when UI lands -------------------
ipcMain.handle('lumox:outputs:list', () =>
  engine.outputs.list().map((o) => ({
    id: o.id, name: o.name, type: o.type, enabled: o.enabled, isOpen: o.isOpen,
    subscribedUniverses: [...o.subscribedUniverses],
  })),
);

ipcMain.handle('lumox:outputs:create', async (_e, { type, config }) => {
  const out = engine.outputs.create(type, config);
  await out.open();
  return out.id;
});

ipcMain.handle('lumox:outputs:remove', (_e, id) => {
  engine.outputs.remove(id);
});

ipcMain.handle('lumox:outputs:available', () => OutputManager.availableTypes());

ipcMain.handle('lumox:universes:list', () =>
  engine.universes.list().map((u) => ({ id: u.id, name: u.name })),
);

ipcMain.handle('lumox:universes:ensure', (_e, { id, name }) => {
  engine.universes.ensure(id, name);
});

ipcMain.handle('lumox:universes:setChannel', (_e, { id, channel, value }) => {
  engine.universes.get(id)?.setChannel(channel, value);
});

ipcMain.handle('lumox:engine:start', () => engine.start());
ipcMain.handle('lumox:engine:stop',  () => engine.stop());

// ---- app lifecycle -----------------------------------------------------
app.whenReady().then(() => {
  engine.start();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  engine.stop();
  await engine.outputs.closeAll();
  if (process.platform !== 'darwin') app.quit();
});
