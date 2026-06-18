// Engine + mix-control IPC — start/stop/status, grand master, blackout.

import { ipcMain } from 'electron';
import { engine } from '../context';
import { vNum } from '../validate';

export function registerEngineHandlers(): void {
  ipcMain.handle('lumox:engine:start', () => engine.start());
  ipcMain.handle('lumox:engine:stop', () => engine.stop());
  ipcMain.handle('lumox:engine:status', () => ({
    running: engine._running,
    frame: engine._frame,
    refreshHz: engine.refreshHz,
  }));

  ipcMain.handle('lumox:master:set', (_e, value) => {
    engine.grandMaster.setValue(vNum(value, 'master'));   // GrandMaster clamps to 0..1
  });

  ipcMain.handle('lumox:blackout:set', (_e, active) => {
    engine.blackout.set(active);
  });
}
