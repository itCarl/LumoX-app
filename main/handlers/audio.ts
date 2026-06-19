// Audio-reactive input IPC — the engine side of audio bindings. The renderer's
// shared audio engine streams level frames here (`levels`, transient); the
// AudioBindingService applies them to the bound targets. Binding CRUD persists with
// the project (dirty + undo), like the MIDI surface. `stream` tells the renderer
// whether to keep capturing + forwarding even when the Connection tab is hidden.

import { ipcMain, BrowserWindow } from 'electron';
import { audioBindings } from '../services/AudioBindingService';
import type { AudioSource, AudioTarget, AudioBindingOptions, AudioLevels } from '../services/AudioBindingService';

function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}

export function registerAudioHandlers(): void {
  audioBindings.on('bindings', (b) => broadcast('audio:bindings', b));
  audioBindings.on('stream', (on) => broadcast('audio:stream', on));

  // Live level frame from the renderer capture — applied only (transient).
  ipcMain.handle('lumox:audio:levels', (_e, frame: AudioLevels) => { audioBindings.applyLevels(frame); });

  ipcMain.handle('lumox:audio:targets', () => audioBindings.targets());
  ipcMain.handle('lumox:audio:listBindings', () => audioBindings.listBindings());
  ipcMain.handle('lumox:audio:addBinding', (_e, { source, target }: { source: AudioSource; target: AudioTarget }) =>
    audioBindings.addBinding(source, target));
  ipcMain.handle('lumox:audio:setBinding', (_e, { id, source, target }: { id: string; source?: AudioSource; target?: AudioTarget }) =>
    audioBindings.setBinding(id, { source, target }));
  ipcMain.handle('lumox:audio:setBindingOptions', (_e, { id, options }: { id: string; options: AudioBindingOptions }) =>
    audioBindings.setBindingOptions(id, options));
  ipcMain.handle('lumox:audio:removeBinding', (_e, { id }: { id: string }) => audioBindings.removeBinding(id));
}
