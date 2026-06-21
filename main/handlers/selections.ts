// Saved-selection IPC — named, ordered, recallable fixture picks stored in the
// show (persisted, undoable). Distinct from the transient live selection
// (`lumox:selection:*`, singular): these are the *saved* presets, and `:recall`
// loads one into the live selection so any FX targeting {mode:'selection'} fans
// across it. list/save/rename/remove/setFixtures mutate saved show state (the
// IPC wrapper flags the project dirty); `:recall` is transient (live target only).

import { ipcMain } from 'electron';
import { show } from '../context';
import { setSelection } from '../services/SelectionService';
import { selectionJSON } from '../serializers';
import { getMainWindow } from '../windows';

const patched = (id: string): boolean => !!show.patch.get(id);
const dedupePruned = (ids: string[]): string[] => {
  const seen = new Set<string>();
  return (ids ?? []).filter((id) => patched(id) && !seen.has(id) && (seen.add(id), true));
};

export function registerSavedSelectionHandlers(): void {
  ipcMain.handle('lumox:selections:list', () => show.listSelections().map(selectionJSON));

  ipcMain.handle('lumox:selections:save', (_e, { name, fixtureIds } = {}) => {
    const ids = dedupePruned(fixtureIds ?? []);
    if (!ids.length) return null;   // nothing selected → nothing to save
    const n = show.listSelections().length + 1;
    const sel = show.addSelection({
      id: `sel_${Math.random().toString(36).slice(2, 8)}`,
      name: (name && String(name).trim()) || `Selection ${n}`,
      fixtureIds: ids,
    });
    return selectionJSON(sel);
  });

  ipcMain.handle('lumox:selections:rename', (_e, { id, name }) => {
    const s = show.selections.get(id);
    if (s && name != null) s.name = String(name).trim() || s.name;
  });

  ipcMain.handle('lumox:selections:remove', (_e, id) => show.removeSelection(id));

  ipcMain.handle('lumox:selections:setFixtures', (_e, { id, fixtureIds }) => {
    const s = show.selections.get(id);
    if (s) s.fixtureIds = dedupePruned(fixtureIds ?? []);
  });

  // Recall — load a saved selection into the live programming selection, in its
  // stored order, and broadcast so every view's badges + FX fan adopt it.
  ipcMain.handle('lumox:selections:recall', (_e, id) => {
    const s = show.selections.get(id);
    if (!s) return [];
    const ids = setSelection(s.fixtureIds);
    getMainWindow()?.webContents.send('selection:changed', ids);
    return ids;
  });
}
