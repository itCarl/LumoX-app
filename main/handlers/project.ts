// Project IPC — Save/Open dialogs + file I/O. The (de)serialization itself
// lives in ProjectService; this layer only owns the Electron dialog + fs.

import { ipcMain, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { getMainWindow } from '../windows';
import { buildProject, restoreProject } from '../services/ProjectService';

const FILTERS = [{ name: 'Lumox Project', extensions: ['lumox', 'json'] }];

export function registerProjectHandlers(): void {
  ipcMain.handle('lumox:project:save', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(getMainWindow()!, {
      title: 'Save Project', defaultPath: 'show.lumox', filters: FILTERS,
    });
    if (canceled || !filePath) return { saved: false };
    await writeFile(filePath, JSON.stringify(buildProject(), null, 2), 'utf8');
    return { saved: true, path: filePath };
  });

  ipcMain.handle('lumox:project:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow()!, {
      title: 'Open Project', properties: ['openFile'], filters: FILTERS,
    });
    if (canceled || !filePaths?.length) return { loaded: false };
    let data: unknown;
    try {
      data = JSON.parse(await readFile(filePaths[0], 'utf8'));
    } catch (err) {
      throw new Error(`Could not read project file: ${(err as Error).message}`);
    }
    await restoreProject(data);   // validateProject() (inside) rejects malformed schema
    getMainWindow()?.webContents.send('project:loaded');
    return { loaded: true, path: filePaths[0] };
  });
}
