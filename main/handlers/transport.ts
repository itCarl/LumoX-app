// Transport IPC — the master tempo (BPM) scenes sync to in 'bpm' driving mode,
// plus where that tempo comes from (manual / midi / audio / link). `get` reads the
// live status; `setBpm` mutates persisted show state (project dirty) but only while
// no external clock is locked. `setSource` and `audioBpm` are transient (machine
// settings / live clock — see handlers/index.ts), so they never dirty the project.
// Every tempo/source change is pushed to all windows via 'transport:changed'.

import { ipcMain, BrowserWindow } from 'electron';
import { transport } from '../services/Transport';
import { updateSettings } from '../services/SettingsService';
import type { TempoSource, TransportStatus } from '../dto';

const SOURCES = new Set<TempoSource>(['manual', 'midi', 'audio', 'link']);

export function registerTransportHandlers(): void {
  transport.on('changed', (status: TransportStatus) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('transport:changed', status);
  });

  ipcMain.handle('lumox:transport:get', () => transport.status());
  ipcMain.handle('lumox:transport:midiInputs', () => transport.midiInputs());

  // Manual edits / taps only take effect when no external clock is driving.
  ipcMain.handle('lumox:transport:setBpm', (_e, bpm: number) =>
    transport.getSource() === 'manual' ? transport.setBpm(bpm) : transport.getBpm());

  // Switch source: apply on the live transport, then persist the choice (and the
  // MIDI device, remembered across sources) to machine settings.
  ipcMain.handle('lumox:transport:setSource', async (_e, payload: { source?: TempoSource; midiInput?: string | null }) => {
    const source = payload?.source as TempoSource;
    if (!SOURCES.has(source)) return transport.status();
    const midiInput = typeof payload?.midiInput === 'string'
      ? (payload.midiInput || null)
      : transport.status().midiInput;
    const status = await transport.setSource(source, midiInput);
    await updateSettings({ tempoSource: source, midiClockInput: midiInput });
    return status;
  });

  // Renderer audio-detector estimate (ignored unless 'audio' is the active source).
  ipcMain.handle('lumox:transport:audioBpm', (_e, bpm: number) => {
    transport.applyAudioBpm(bpm);
    return transport.getBpm();
  });
}
