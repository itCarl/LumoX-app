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
import type { FixtureLimits, FixtureChannelFlags } from '../../src/index';
import { engine, show, markLiveUniverse, clearProgrammer, programmerSummary, rebuildLimits } from '../context';
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

  // Per-channel flag — `flag` is 'fade' | 'dimmer', `channel` is 1-based local.
  // `value` true/false sets it; null clears that flag (and the whole entry if empty).
  ipcMain.handle('lumox:fixtures:setChannelFlag', (_e, { fixtureIds, channel, flag, value }) => {
    if (flag !== 'fade' && flag !== 'dimmer') return;
    const ch = Number(channel);
    for (const id of (fixtureIds ?? []) as string[]) {
      const fx = show.patch.get(id);
      if (!fx || ch < 1 || ch > fx.channelCount) continue;
      const flags: FixtureChannelFlags = { ...(fx.channelFlags ?? {}) };
      const entry = { ...(flags[ch] ?? {}) };
      if (value === null || value === undefined) delete entry[flag as 'fade' | 'dimmer'];
      else entry[flag as 'fade' | 'dimmer'] = !!value;
      if (Object.keys(entry).length) flags[ch] = entry; else delete flags[ch];
      fx.channelFlags = Object.keys(flags).length ? flags : null;
    }
    rebuildLimits();
  });
}
