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
import type { FixtureLimits } from '../../src/index';
import { engine, show } from '../context';
import { markLiveUniverse, clearProgrammer, programmerSummary } from '../services/OutputPatchService';
import { rebuildLimits } from '../services/FixtureMaps';
import { vChannel, vLevel } from '../validate';

export function registerFixtureHandlers(): void {
  // Engage one fixture-local channel at a value (a moved fader). For an RGB-only
  // fixture's virtual dimmer the renderer passes an explicit `absChannel` (a
  // virtual-region address) instead of a fixture-local `channel`.
  ipcMain.handle('lumox:fixtures:setChannel', (_e, { fixtureId, channel, value, absChannel }) => {
    const fx = show.patch.get(fixtureId);
    if (!fx) return;
    const u = engine.universes.get(fx.universeId);
    if (!u) return;
    if (absChannel != null) {
      const abs = Number(absChannel);
      if (fx.virtualDimmers().some((vd) => vd.virtualAddr === abs)) u.engage(abs, vLevel(value));
    } else {
      const ch = vChannel(channel);
      if (ch > fx.channelCount) return;
      u.engage(fx.startAddress + ch - 1, vLevel(value));
    }
    markLiveUniverse(fx.universeId);
  });

  // Release one fixture-local channel (drop it from the programmer / disengage).
  ipcMain.handle('lumox:fixtures:releaseChannel', (_e, { fixtureId, channel, absChannel }) => {
    const fx = show.patch.get(fixtureId);
    if (!fx) return;
    const u = engine.universes.get(fx.universeId);
    if (!u) return;
    if (absChannel != null) {
      const abs = Number(absChannel);
      if (fx.virtualDimmers().some((vd) => vd.virtualAddr === abs)) u.release(abs);
    } else {
      const ch = vChannel(channel);
      if (ch > fx.channelCount) return;
      u.release(fx.startAddress + ch - 1);
    }
    markLiveUniverse(fx.universeId);
  });

  // Reset the live programmer (drops every manual write); returns the new summary.
  ipcMain.handle('lumox:fixtures:clearProgrammer', () => {
    clearProgrammer();
    return programmerSummary();
  });

  // Engaged-channel summary of the programmer — drives the fader-editor header.
  ipcMain.handle('lumox:fixtures:programmer', () => programmerSummary());

  // Per-fixture output limits — merge a patch into each fixture's `limits`
  // (a null/absent key clears that limit), applied across a whole selection.
  // The engine's Limits post-stage re-resolves via `rebuildLimits`.
  ipcMain.handle('lumox:fixtures:setLimits', (_e, { fixtureIds, patch }) => {
    for (const id of (fixtureIds ?? []) as string[]) {
      const fx = show.patch.get(id);
      if (!fx) continue;
      const cur: Record<string, unknown> = { ...(fx.limits ?? {}) };
      for (const [k, v] of Object.entries((patch ?? {}) as Record<string, unknown>)) {
        if (v === null || v === undefined) delete cur[k];
        else cur[k] = v;
      }
      fx.limits = (Object.keys(cur).length ? cur : null) as FixtureLimits | null;
    }
    rebuildLimits();
  });

  // Drop every limit on the given fixtures.
  ipcMain.handle('lumox:fixtures:clearLimits', (_e, { fixtureIds }) => {
    for (const id of (fixtureIds ?? []) as string[]) {
      const fx = show.patch.get(id);
      if (fx) fx.limits = null;
    }
    rebuildLimits();
  });
}
