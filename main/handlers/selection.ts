// Selection IPC — the transient, ordered live "programming target". It is not
// part of the saved show (like the programmer); it drives any FX layer whose
// target is {mode:'selection'}. Quick-select ops (all / invert) and reordering
// are computed in main against the patch and broadcast back so every view
// reflects the same order.

import { ipcMain } from 'electron';
import { getSelection, setSelection, selectionOp } from '../context';
import { getMainWindow } from '../windows';

/** Push the current selection to the renderer (badges + FX target reflect it). */
function broadcast(ids: string[]): string[] {
  getMainWindow()?.webContents.send('selection:changed', ids);
  return ids;
}

export function registerSelectionHandlers(): void {
  ipcMain.handle('lumox:selection:get', () => getSelection());

  // `set` is the plain mirror of a click/marquee selection made in a view — it
  // does NOT broadcast (the originating view already shows it; echoing would just
  // re-render it). The quick-ops below DO broadcast, since they reorder in main.
  ipcMain.handle('lumox:selection:set', (_e, { ids }) => setSelection(ids ?? []));

  ipcMain.handle('lumox:selection:add', (_e, { ids }) =>
    broadcast(setSelection([...getSelection(), ...(ids ?? [])])));
  ipcMain.handle('lumox:selection:remove', (_e, { ids }) => {
    const drop = new Set<string>(ids ?? []);
    return broadcast(setSelection(getSelection().filter((id) => !drop.has(id))));
  });
  ipcMain.handle('lumox:selection:clear', () => broadcast(setSelection([])));

  ipcMain.handle('lumox:selection:all',     () => broadcast(selectionOp('all')));
  ipcMain.handle('lumox:selection:invert',  () => broadcast(selectionOp('invert')));
  ipcMain.handle('lumox:selection:reorder',  (_e, { from, to }) => broadcast(selectionOp('reorder', { from, to })));
}
