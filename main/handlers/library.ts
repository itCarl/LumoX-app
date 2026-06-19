// Fixture library IPC — list profiles, channel types, add / remove a user definition.

import { ipcMain } from 'electron';
import { ChannelTypeRegistry } from '../../src/index';
import { show } from '../context';
import { defJSON } from '../serializers';
import { getMainWindow } from '../windows';
import { CUSTOM_VENDOR, saveUserDefinition, deleteUserDefinitionFile } from '../services/UserLibraryService';

export function registerLibraryHandlers(): void {
  ipcMain.handle('lumox:library:list', () =>
    show.library.list().filter((d) => d.manufacturer && d.model).map(defJSON));

  // Channel types for the fixture editor's per-channel dropdown.
  ipcMain.handle('lumox:library:channelTypes', () =>
    ChannelTypeRegistry.all()
      .map((t) => ({ id: t.id, name: t.name, group: t.group, color: t.color }))
      .sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)));

  // Add a user-authored fixture definition. `def` = plain JSON
  // { model, type, modes:[{ name, channels:[{ name, typeId }] }] }.
  // All user fixtures are forced under the "Custom" vendor (real vendor profiles
  // ship bundled with the app); the saved fixture persists to the user library
  // under userData so it survives restarts (see UserLibraryService).
  ipcMain.handle('lumox:library:add', async (_e, def) => {
    if (!def?.model?.trim()) throw new Error('Model is required');
    if (!def.modes?.length || !def.modes.some((m: { channels?: unknown[] }) => m.channels?.length)) {
      throw new Error('At least one mode with one channel is required');
    }
    const added = show.library.add({ ...def, manufacturer: CUSTOM_VENDOR }, 'user');   // fromJSON validates typeIds
    try {
      await saveUserDefinition(added);
    } catch (err) {
      // Keep the in-memory add — it's usable this session — but warn that it
      // won't survive a restart.
      console.error('[library] persisting user fixture failed:', (err as Error).message);
    }
    getMainWindow()?.webContents.send('library:changed');  // refresh the main window's library tile
    return defJSON(added);
  });

  // Delete a user (Custom) fixture — removes it from the library and deletes its
  // persisted file. Built-in profiles can't be removed; a fixture still in the
  // patch is refused so saving the project can't silently drop its definition.
  ipcMain.handle('lumox:library:remove', async (_e, id) => {
    const def = show.library.get(String(id ?? ''));
    if (!def) throw new Error('Fixture not found');
    if (def.source !== 'user') throw new Error('Only Custom fixtures can be deleted');
    if (show.patch.list().some((f) => f.definition.id === def.id)) {
      throw new Error('Fixture is in use by the patch — unpatch it first');
    }
    show.library.remove(def.id);
    try {
      await deleteUserDefinitionFile(def.id);
    } catch (err) {
      console.error('[library] deleting user fixture file failed:', (err as Error).message);
    }
    getMainWindow()?.webContents.send('library:changed');
    return { ok: true, id: def.id };
  });
}
