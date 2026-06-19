// Discovery IPC — find Art-Net nodes on the network (ArtPoll / ArtPollReply).
// Runtime-only: the Connection tab starts it while visible and stops it when
// hidden. Results stream to the renderer via the `discovery:changed` push.

import { ipcMain } from 'electron';
import { discovery } from '../context';
import { getMainWindow } from '../windows';

export function registerDiscoveryHandlers(): void {
  ipcMain.handle('lumox:discovery:start', async () => { await discovery.start(); return discovery.status; });
  ipcMain.handle('lumox:discovery:stop', () => discovery.stop());
  ipcMain.handle('lumox:discovery:list', () => discovery.list());

  // Push device-set changes to the Connection tab.
  discovery.on('changed', (devices) =>
    getMainWindow()?.webContents.send('discovery:changed', devices));
}
