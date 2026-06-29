// Fixture library IPC — list profiles, channel types, add / remove a user definition.

import { ipcMain } from 'electron';
import { ChannelTypeRegistry, buildMatrixDefinition } from '../../src/index';
import type { MatrixGenOptions } from '../../src/index';
import { show } from '../context';
import { defJSON } from '../serializers';
import { getMainWindow } from '../windows';
import { CUSTOM_VENDOR, saveUserDefinition, deleteUserDefinitionFile } from '../services/UserLibraryService';

export function registerLibraryHandlers(): void {
  // Lightweight vendor list — no definitions parsed (the bundled library is
  // lazy-loaded per vendor). The renderer renders accordion heads from this and
  // fetches a vendor's fixtures on expand via `lumox:library:vendor`.
  ipcMain.handle('lumox:library:vendors', () => show.library.vendors());

  // One vendor's fixtures — parses that vendor's directory on demand, then
  // returns its definition summaries.
  ipcMain.handle('lumox:library:vendor', async (_e, name) => {
    await show.library.ensureVendor(String(name ?? ''));
    return show.library.list()
      .filter((d) => d.manufacturer === name && d.model)
      .map(defJSON);
  });

  // Full list — forces every vendor to load (used by search / browse-all). Avoid
  // calling at boot; prefer `vendors` + `vendor`.
  ipcMain.handle('lumox:library:list', async () => {
    await show.library.ensureAll();
    return show.library.list().filter((d) => d.manufacturer && d.model).map(defJSON);
  });

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
  // `replaceId` (optional): the id being edited. When a Custom fixture is renamed
  // (its id changes) the stale entry + file are dropped, so an in-place edit doesn't
  // leave a duplicate. Built-in sources are never touched — editing one saves a copy.
  ipcMain.handle('lumox:library:add', async (_e, def, replaceId) => {
    if (!def?.model?.trim()) throw new Error('Model is required');
    if (!def.modes?.length || !def.modes.some((m: { channels?: unknown[] }) => m.channels?.length)) {
      throw new Error('At least one mode with one channel is required');
    }
    return addUserDef(def, typeof replaceId === 'string' ? replaceId : undefined);
  });

  // Create a multi-cell matrix/strip fixture from grid options and save it to the
  // Custom library (same persist path as `library:add`). The generator throws on
  // out-of-range grids (too many cells / over 512 channels); the message surfaces
  // in the renderer. See docs/knowledge-base/fixtures.md (matrix/strip creation).
  ipcMain.handle('lumox:library:createMatrix', async (_e, opts: MatrixGenOptions) =>
    addUserDef(buildMatrixDefinition(opts)));

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

// Add a definition to the Custom library, persist it, optionally drop a renamed
// id's stale entry/file, and refresh the library tile. Shared by `library:add`
// and `library:createMatrix`. The vendor is always forced to "Custom".
async function addUserDef(def: unknown, replaceId?: string) {
  const added = show.library.add({ ...(def as object), manufacturer: CUSTOM_VENDOR }, 'user');   // fromJSON validates typeIds (replaces by id)
  try {
    await saveUserDefinition(added);
  } catch (err) {
    // Keep the in-memory add — it's usable this session — but warn that it
    // won't survive a restart.
    console.error('[library] persisting user fixture failed:', (err as Error).message);
  }
  // Renamed Custom fixture → remove the old id (unless it's still patched).
  if (replaceId && replaceId !== added.id) {
    const old = show.library.get(replaceId);
    if (old?.source === 'user' && !show.patch.list().some((f) => f.definition.id === replaceId)) {
      show.library.remove(replaceId);
      await deleteUserDefinitionFile(replaceId).catch(() => {});
    }
  }
  getMainWindow()?.webContents.send('library:changed');  // refresh the main window's library tile
  return defJSON(added);
}
