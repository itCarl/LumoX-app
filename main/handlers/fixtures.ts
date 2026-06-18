// Fixture live-write IPC — write a fixture-local channel (fader editor). The
// value lands in the fixture's universe programmer buffer; BaseLayer copies
// programmer → data each tick, so it sticks.

import { ipcMain } from 'electron';
import { engine, show } from '../context';
import { vChannel, vLevel } from '../validate';

export function registerFixtureHandlers(): void {
  ipcMain.handle('lumox:fixtures:setChannel', (_e, { fixtureId, channel, value }) => {
    const fx = show.patch.get(fixtureId);
    if (!fx) return;
    fx.setChannel(vChannel(channel), vLevel(value));
    const u = engine.universes.get(fx.universeId);
    if (u) fx.apply(u);
  });
}
