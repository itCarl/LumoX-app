// History IPC — undo / redo of saved show edits. The snapshots + stacks live in
// HistoryService; this layer exposes them and, after a successful step, tells the
// renderer to rebuild its views (the same `project:loaded` path a project open
// uses, since undo/redo replace the whole show).

import { ipcMain } from 'electron';
import { getMainWindow } from '../windows';
import { undo, redo, historyState } from '../services/HistoryService';

export function registerHistoryHandlers(): void {
  ipcMain.handle('lumox:history:state', () => historyState());

  ipcMain.handle('lumox:history:undo', async () => {
    if (await undo()) getMainWindow()?.webContents.send('project:loaded');
    return historyState();
  });

  ipcMain.handle('lumox:history:redo', async () => {
    if (await redo()) getMainWindow()?.webContents.send('project:loaded');
    return historyState();
  });
}
