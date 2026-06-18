// Fixture library IPC — list profiles, channel types, add a user definition.

import { ipcMain } from 'electron';
import { ChannelTypeRegistry } from '../../src/index';
import { show } from '../context';
import { defJSON } from '../serializers';
import { getMainWindow } from '../windows';

export function registerLibraryHandlers(): void {
  ipcMain.handle('lumox:library:list', () =>
    show.library.list().filter((d) => d.manufacturer && d.model).map(defJSON));

  // Channel types for the fixture editor's per-channel dropdown.
  ipcMain.handle('lumox:library:channelTypes', () =>
    ChannelTypeRegistry.all()
      .map((t) => ({ id: t.id, name: t.name, group: t.group }))
      .sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)));

  // Add a user-authored fixture definition. `def` = plain JSON
  // { manufacturer, model, type, modes:[{ name, channels:[{ name, typeId }] }] }.
  ipcMain.handle('lumox:library:add', (_e, def) => {
    if (!def?.manufacturer?.trim() || !def?.model?.trim()) {
      throw new Error('Manufacturer and model are required');
    }
    if (!def.modes?.length || !def.modes.some((m: { channels?: unknown[] }) => m.channels?.length)) {
      throw new Error('At least one mode with one channel is required');
    }
    const added = show.library.add(def, 'user');   // FixtureDefinition.fromJSON validates typeIds
    getMainWindow()?.webContents.send('library:changed');  // refresh the main window's library tile
    return defJSON(added);
  });
}
