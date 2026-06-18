// Group IPC — fixture groups: list / add / remove / set members / rename.
// A group may only hold fixtures that share one channel configuration.

import { ipcMain } from 'electron';
import { Group } from '../../src/index';
import { show, nextColor, configKey, sameConfig } from '../context';
import { groupJSON } from '../serializers';

export function registerGroupHandlers(): void {
  ipcMain.handle('lumox:groups:list', () => show.groups.list().map(groupJSON));

  ipcMain.handle('lumox:groups:add', (_e, { name, color, fixtureIds = [] } = {}) => {
    if (!sameConfig(fixtureIds)) {
      throw new Error('A group may only contain fixtures with the same channel configuration');
    }
    const n = show.groups.list().length + 1;
    const g = show.groups.add(new Group({
      name: name || `Group ${n}`,
      color: color || nextColor(),
      fixtureIds,
    }));
    const first = show.patch.get(fixtureIds[0]);
    if (first) g.configKey = configKey(first);
    return groupJSON(g);
  });

  ipcMain.handle('lumox:groups:remove', (_e, id) => show.groups.remove(id));

  ipcMain.handle('lumox:groups:setFixtures', (_e, { id, fixtureIds }) => {
    const g = show.groups.get(id);
    if (!g) return;
    if (!sameConfig(fixtureIds)) {
      throw new Error('A group may only contain fixtures with the same channel configuration');
    }
    g.clear();
    for (const fid of fixtureIds) g.add(fid);
  });

  ipcMain.handle('lumox:groups:rename', (_e, { id, name, color }) => {
    const g = show.groups.get(id);
    if (!g) return;
    if (name != null) g.name = name;
    if (color != null) g.color = color;
  });
}
