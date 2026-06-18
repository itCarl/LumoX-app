// Window + editor IPC — custom frameless titlebar controls and the fixture
// editor window.

import { ipcMain, BrowserWindow } from 'electron';
import { getMainWindow, openEditorWindow } from '../windows';

export function registerWindowHandlers(): void {
  ipcMain.handle('lumox:editor:open', () => openEditorWindow());

  // Close whichever window made the call (used by frameless child windows).
  ipcMain.handle('lumox:win:closeSelf', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  ipcMain.handle('lumox:win:minimize', () => getMainWindow()?.minimize());
  ipcMain.handle('lumox:win:maximize', () => {
    const win = getMainWindow();
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('lumox:win:close', () => getMainWindow()?.close());
  ipcMain.handle('lumox:win:isMaximized', () => getMainWindow()?.isMaximized() ?? false);
}
