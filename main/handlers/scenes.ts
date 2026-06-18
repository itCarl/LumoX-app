// Scene IPC — capture / recall / remove / rename / colour / duplicate / update.
// Scenes are mix layers; recall toggles a scene's opacity. Banks own scene
// ordering and the "one active per bank" rule.

import { ipcMain } from 'electron';
import { Scene } from '../../src/index';
import { engine, show, banks, updateActiveUniverses } from '../context';
import { sceneJSON } from '../serializers';

export function registerSceneHandlers(): void {
  ipcMain.handle('lumox:scenes:list', () => show.listScenes().map(sceneJSON));

  ipcMain.handle('lumox:scenes:capture', (_e, { name, bankId } = {}) => {
    const universes = engine.universes.list();
    const s = Scene.snapshot({ name: name || 'New Scene', universes });
    show.addScene(s);
    engine.scenes.addTrack(s.toMixerTrack({ blend: 'htp', opacity: 0 }));
    banks.addScene(bankId, s.id);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:recall', (_e, { id, on }) => {
    if (on) {
      // only one scene active per bank — turn its siblings off
      const bank = banks.bankOf(id);
      if (bank) for (const sid of bank.sceneIds) if (sid !== id) engine.scenes.setOpacity(sid, 0);
    }
    engine.scenes.setOpacity(id, on ? 1 : 0);
    updateActiveUniverses();
  });

  ipcMain.handle('lumox:scenes:remove', (_e, id) => {
    engine.scenes.removeTrack(id);
    show.removeScene(id);
    banks.purgeScene(id);
    updateActiveUniverses();
  });

  ipcMain.handle('lumox:scenes:rename', (_e, { id, name }) => {
    const s = show.scenes.get(id);
    if (s) s.name = name;
  });

  ipcMain.handle('lumox:scenes:setColor', (_e, { id, color }) => {
    const s = show.scenes.get(id);
    if (s && color) s.color = color;
  });

  // Duplicate a scene into the same bank.
  ipcMain.handle('lumox:scenes:duplicate', (_e, id) => {
    const src = show.scenes.get(id);
    if (!src) return null;
    const copy = new Scene({ name: `${src.name} copy`, values: JSON.parse(JSON.stringify(src.values)) });
    copy.color = src.color;
    show.addScene(copy);
    engine.scenes.addTrack(copy.toMixerTrack({ blend: 'htp', opacity: 0 }));
    banks.insertAfter(id, copy.id);
    return sceneJSON(copy);
  });

  // Re-capture the current live output into an existing scene (keeps opacity).
  ipcMain.handle('lumox:scenes:update', (_e, id) => {
    const s = show.scenes.get(id);
    if (!s) return;
    const snap = Scene.snapshot({ universes: engine.universes.list() });
    s.values = snap.values;
    const opacity = engine.scenes.tracks.get(id)?.opacity ?? 0;
    engine.scenes.removeTrack(id);
    engine.scenes.addTrack(s.toMixerTrack({ blend: 'htp', opacity }));
  });
}
