// Fixture live-write IPC — engage / release a fixture-local channel (fader
// editor LIVE mode). The write lands on exactly that one channel of the
// fixture's universe programmer buffer and flags it as ENGAGED; BaseLayer copies
// programmer → data each tick, so it sticks, and `markLiveUniverse` flags the
// universe so the broadcast output transmits it.
//
// Engaging one channel (not flushing the whole fixture) is what lets a Store
// capture exactly the faders you moved — see Universe.engage + Scene.snapshot's
// `engagedOnly`. The programmer is the staging buffer capture reads from: build a
// look in LIVE, then `clearProgrammer` resets it or `scenes:capture` stores it.

import { ipcMain } from 'electron';
import { engine, show, markLiveUniverse, clearProgrammer, programmerSummary } from '../context';
import { vChannel, vLevel } from '../validate';

export function registerFixtureHandlers(): void {
  // Engage one fixture-local channel at a value (a moved fader).
  ipcMain.handle('lumox:fixtures:setChannel', (_e, { fixtureId, channel, value }) => {
    const fx = show.patch.get(fixtureId);
    if (!fx) return;
    const ch = vChannel(channel);
    if (ch > fx.channelCount) return;
    const u = engine.universes.get(fx.universeId);
    if (u) u.engage(fx.startAddress + ch - 1, vLevel(value));
    markLiveUniverse(fx.universeId);
  });

  // Release one fixture-local channel (drop it from the programmer / disengage).
  ipcMain.handle('lumox:fixtures:releaseChannel', (_e, { fixtureId, channel }) => {
    const fx = show.patch.get(fixtureId);
    if (!fx) return;
    const ch = vChannel(channel);
    if (ch > fx.channelCount) return;
    const u = engine.universes.get(fx.universeId);
    if (u) u.release(fx.startAddress + ch - 1);
    markLiveUniverse(fx.universeId);
  });

  // Reset the live programmer (drops every manual write); returns the new summary.
  ipcMain.handle('lumox:fixtures:clearProgrammer', () => {
    clearProgrammer();
    return programmerSummary();
  });

  // Engaged-channel summary of the programmer — drives the fader-editor header.
  ipcMain.handle('lumox:fixtures:programmer', () => programmerSummary());
}
