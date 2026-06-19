// Bank IPC — ordered scene containers (CONTROL view): list / add / rename /
// remove. Removing a bank drops its scenes from the engine + show.

import { ipcMain } from 'electron';
import { engine, show, banks } from '../context';
import { bankJSON } from '../serializers';

export function registerBankHandlers(): void {
  ipcMain.handle('lumox:banks:list', () => banks.list().map(bankJSON));
  ipcMain.handle('lumox:banks:add', (_e, { name } = {}) => bankJSON(banks.add(name)));
  ipcMain.handle('lumox:banks:rename', (_e, { id, name }) => banks.rename(id, name));
  ipcMain.handle('lumox:banks:remove', (_e, id) => {
    for (const sid of banks.remove(id)) { engine.scenes.removeTrack(sid); show.removeScene(sid); }
    banks.ensureDefault();
  });
}
