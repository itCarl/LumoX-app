// Palettes + FX-rack presets IPC. Palettes are named hex lists reused by COLOR
// layers; presets are named copies of a scene's FX rack, applied to any scene.

import { ipcMain } from 'electron';
import { normalizeLayer } from '../../src/index';
import { show, rebuildSceneTrack } from '../context';
import { palettes, presets, newId } from '../services/presets';
import { sceneJSON } from '../serializers';

const HEX6 = /^#?[0-9a-fA-F]{6}$/;
const norm6 = (h: string): string => (h.startsWith('#') ? h.toLowerCase() : `#${h.toLowerCase()}`);
const cleanColors = (c: unknown): string[] =>
  (Array.isArray(c) ? c : []).filter((h): h is string => typeof h === 'string' && HEX6.test(h)).map(norm6);

export function registerPaletteHandlers(): void {
  // ---- colour palettes ----
  ipcMain.handle('lumox:palettes:list', () => palettes.list());
  ipcMain.handle('lumox:palettes:add', (_e, { name, colors }) =>
    palettes.add({ id: newId('pal'), name: (name || 'Palette').toString().slice(0, 60), colors: cleanColors(colors) }));
  ipcMain.handle('lumox:palettes:rename', (_e, { id, name }) => { palettes.rename(id, String(name).slice(0, 60)); });
  ipcMain.handle('lumox:palettes:remove', (_e, id) => { palettes.remove(id); });

  // ---- FX-rack presets ----
  ipcMain.handle('lumox:presets:list', () => presets.list());
  ipcMain.handle('lumox:presets:saveRack', (_e, { sceneId, name }) => {
    const s = show.scenes.get(sceneId);
    if (!s || !s.layers.length) return null;
    return presets.add({ id: newId('pre'), name: (name || s.name).toString().slice(0, 60), layers: structuredClone(s.layers) });
  });
  ipcMain.handle('lumox:presets:applyRack', (_e, { sceneId, presetId }) => {
    const s = show.scenes.get(sceneId);
    const p = presets.get(presetId);
    if (!s || !p) return null;
    // fresh layer ids so the applied rack is independent of the preset
    s.layers = p.layers.map((l) => normalizeLayer({ ...structuredClone(l), id: undefined }));
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });
  ipcMain.handle('lumox:presets:rename', (_e, { id, name }) => { presets.rename(id, String(name).slice(0, 60)); });
  ipcMain.handle('lumox:presets:remove', (_e, id) => { presets.remove(id); });
}
