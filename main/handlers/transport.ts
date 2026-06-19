// Transport IPC — the master tempo (BPM) scenes sync to in 'bpm' driving mode.
// `get` is read-only; `setBpm` mutates persisted show state (project dirty).

import { ipcMain } from 'electron';
import { transport } from '../services/Transport';

export function registerTransportHandlers(): void {
  ipcMain.handle('lumox:transport:get', () => ({ bpm: transport.getBpm() }));
  ipcMain.handle('lumox:transport:setBpm', (_e, bpm) => transport.setBpm(bpm));
}
