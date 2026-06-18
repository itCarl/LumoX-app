// Universe IPC — list / ensure / write a channel / read mixed output.

import { ipcMain } from 'electron';
import { engine } from '../context';
import { vUniverseId, vChannel, vLevel } from '../validate';

export function registerUniverseHandlers(): void {
  ipcMain.handle('lumox:universes:list', () =>
    engine.universes.list().map((u) => ({ id: u.id, name: u.name })),
  );

  ipcMain.handle('lumox:universes:ensure', (_e, { id, name }) => {
    engine.universes.ensure(vUniverseId(id), typeof name === 'string' ? name : undefined);
  });

  ipcMain.handle('lumox:universes:setChannel', (_e, { id, channel, value }) => {
    engine.universes.get(vUniverseId(id))?.setChannel(vChannel(channel), vLevel(value));
  });

  // Live mixed output (post-pipeline) for meters.
  ipcMain.handle('lumox:universes:read', (_e, id) =>
    Array.from(engine.universes.get(vUniverseId(id))?.data ?? []),
  );
}
