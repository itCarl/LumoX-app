// Settings IPC — read/update application preferences (SettingsService) and push
// changes to every renderer window. DMX defaults (protocol/host/rate) now only
// seed NEW per-universe outputs; the live output patch is project-scoped and
// edited in the Connection tab (see handlers/outputs.ts). (Autosave reschedules
// itself from the same `settingsEvents` in the project handler.)

import { ipcMain, BrowserWindow } from 'electron';
import type { AppSettings } from '../dto';
import { getSettings, updateSettings, settingsEvents } from '../services/SettingsService';

export function registerSettingsHandlers(): void {
  // Push to all windows so accent/language apply to the editor window too.
  settingsEvents.on('changed', (settings: AppSettings) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', settings);
  });

  ipcMain.handle('lumox:settings:get', () => getSettings());
  ipcMain.handle('lumox:settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch ?? {}));
}
