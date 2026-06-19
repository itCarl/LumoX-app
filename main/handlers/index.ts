// Handler registry — wires every `lumox:*` IPC channel. Call once at startup.

import { ipcMain } from 'electron';
import { registerWindowHandlers } from './window';
import { registerOutputHandlers } from './outputs';
import { registerUniverseHandlers } from './universes';
import { registerEngineHandlers } from './engine';
import { registerLibraryHandlers } from './library';
import { registerPatchHandlers } from './patch';
import { registerGroupHandlers } from './groups';
import { registerFixtureHandlers } from './fixtures';
import { registerSceneHandlers } from './scenes';
import { registerBankHandlers } from './banks';
import { registerTransportHandlers } from './transport';
import { registerPaletteHandlers } from './palettes';
import { registerProjectHandlers } from './project';
import { registerSettingsHandlers } from './settings';
import { registerDiscoveryHandlers } from './discovery';
import { registerHistoryHandlers } from './history';
import { markDirty } from '../services/ProjectService';
import { recordHistory } from '../services/HistoryService';

// Read-only actions and channels that touch only transient (unsaved) state —
// live output, playback, windows, the project commands themselves — never flag
// the project dirty. Everything else mutates saved show state.
const READONLY = /:(list|get|read|values|status|available|overlaps|channelTypes|info|isMaximized)$/;
const TRANSIENT_AREAS = /^lumox:(win|engine|universes|master|blackout|project|editor|settings|discovery|history):/;
const TRANSIENT_CHANNELS = new Set([
  'lumox:fixtures:setChannel',                                                   // LIVE programmer write
  'lumox:fixtures:clearProgrammer', 'lumox:fixtures:programmer',                  // programmer reset / query
  'lumox:scenes:recall',                                                          // playback (opacity)
  'lumox:scenes:transport',                                                       // scene playhead (runtime)
]);
const dirties = (ch: string): boolean =>
  !READONLY.test(ch) && !TRANSIENT_AREAS.test(ch) && !TRANSIENT_CHANNELS.has(ch);

export function registerHandlers(): void {
  // Wrap ipcMain.handle so any show-mutating channel flags the project dirty
  // after it resolves — one place instead of scattering markDirty() everywhere.
  const orig = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = ((channel: string, listener: (...a: any[]) => any) => {
    orig(channel, async (...args: any[]) => {
      const result = await listener(...args);
      if (dirties(channel)) { markDirty(); recordHistory(channel); }
      return result;
    });
  }) as typeof ipcMain.handle;

  registerWindowHandlers();
  registerOutputHandlers();
  registerUniverseHandlers();
  registerEngineHandlers();
  registerLibraryHandlers();
  registerPatchHandlers();
  registerGroupHandlers();
  registerFixtureHandlers();
  registerSceneHandlers();
  registerBankHandlers();
  registerTransportHandlers();
  registerPaletteHandlers();
  registerProjectHandlers();
  registerSettingsHandlers();
  registerDiscoveryHandlers();
  registerHistoryHandlers();

  ipcMain.handle = orig;   // restore — all handlers are registered now
}
