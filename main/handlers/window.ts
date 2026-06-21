// Window + editor IPC — custom frameless titlebar controls and the fixture
// editor window.

import { ipcMain, BrowserWindow } from 'electron';
import { getMainWindow, openEditorWindow, getEditTargetId } from '../windows';
import { show } from '../context';

export function registerWindowHandlers(): void {
  // Open the fixture editor — blank for a new fixture, or pre-loaded with `defId`.
  ipcMain.handle('lumox:editor:open', (_e, defId) => openEditorWindow(typeof defId === 'string' ? defId : undefined));

  // The fixture the editor should load on init, as full authoring JSON (channels +
  // capabilities + modes + physical) plus its `source` ('user' | 'builtin'); null
  // for a new fixture. Lazy-loads the vendor so any library fixture is editable.
  ipcMain.handle('lumox:editor:target', async () => {
    const id = getEditTargetId();
    if (!id) return null;
    await show.library.ensure(id).catch((err) =>
      console.error('[library] editor target load failed:', (err as Error).message));
    const def = show.library.get(id);
    return def ? { def: def.toJSON(), source: def.source } : null;
  });

  // Close / minimize whichever window made the call (used by frameless
  // standalone windows like the fixture editor, which can't target the main
  // window's controls).
  ipcMain.handle('lumox:win:closeSelf', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('lumox:win:minimizeSelf', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
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
