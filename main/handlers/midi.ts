// MIDI control-surface IPC — open the MIDI mapping window, the click-to-assign
// (learn) flow, binding CRUD, and the event streams that drive the main-window
// assign overlay + the MIDI window's table / status / live monitor.
//
// Broadcasts go to EVERY window (like settings:changed): the main window listens
// for `midi:assign-mode`, the MIDI window for the rest. A learned binding flags
// the project dirty + records an undo step (it isn't created through a wrapped
// IPC call, so the registry's auto-dirty doesn't see it).

import { ipcMain, BrowserWindow } from 'electron';
import { midiService } from '../services/MidiService';
import type { MidiBindingOptions } from '../services/MidiService';
import { openMidiWindow } from '../windows';
import { markDirty } from '../services/ProjectService';
import { recordHistory } from '../services/HistoryService';

function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}

export function registerMidiHandlers(): void {
  midiService.on('status', (s) => broadcast('midi:status', s));
  midiService.on('bindings', (b) => broadcast('midi:bindings', b));
  midiService.on('assign-mode', (a) => broadcast('midi:assign-mode', a));
  midiService.on('awaiting-input', (a) => broadcast('midi:awaiting-input', a));
  midiService.on('message', (m) => broadcast('midi:message', m));
  midiService.on('feedback', (f) => broadcast('midi:feedback', f));
  midiService.on('dirty', () => { markDirty(); recordHistory('lumox:midi:learn'); });

  ipcMain.handle('lumox:midi:openWindow', () => openMidiWindow());
  ipcMain.handle('lumox:midi:status', () => midiService.status());
  ipcMain.handle('lumox:midi:listBindings', () => midiService.listBindings());
  ipcMain.handle('lumox:midi:beginAssign', () => midiService.beginAssign());
  ipcMain.handle('lumox:midi:pickTarget', (_e, descriptor: string | string[]) => midiService.pickTarget(descriptor));
  ipcMain.handle('lumox:midi:cancelAssign', () => midiService.cancelAssign());
  ipcMain.handle('lumox:midi:setBindingOptions', (_e, { id, options }: { id: string; options: MidiBindingOptions }) =>
    midiService.setBindingOptions(id, options));
  ipcMain.handle('lumox:midi:removeBinding', (_e, { id }: { id: string }) => midiService.removeBinding(id));
}
