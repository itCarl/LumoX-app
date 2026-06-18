// Output IPC — Art-Net / sACN devices (create / update / remove / list).

import { ipcMain } from 'electron';
import { OutputManager } from '../../src/index';
import { engine } from '../context';
import { outputJSON } from '../serializers';
import { vNum, vUniverseId, vString, vHost } from '../validate';

export function registerOutputHandlers(): void {
  ipcMain.handle('lumox:outputs:list', () => engine.outputs.list().map(outputJSON));

  // Create a device (Art-Net unicast → one ESP32, subscribed to one universe).
  ipcMain.handle('lumox:outputs:create', async (_e, { type = 'artnet', config = {} }) => {
    const { universeId, maxRateHz = 40, host, ...rest } = config;
    const out = engine.outputs.create(vString(type, 'type'), {
      maxRateHz: vNum(maxRateHz, 'maxRateHz', 1, 60),
      ...(host != null ? { host: vHost(host) } : {}),
      subscribedUniverses: universeId != null ? [vUniverseId(universeId)] : [],
      ...rest,
    });
    await out.open();
    return outputJSON(out);
  });

  ipcMain.handle('lumox:outputs:update', (_e, { id, name, host, universeId, maxRateHz, enabled }) => {
    const o = engine.outputs.get(id);
    if (!o) return null;
    if (name != null) o.name = vString(name, 'name');
    if (host != null) (o as { host?: string }).host = vHost(host);
    if (enabled != null) o.enabled = !!enabled;
    if (maxRateHz != null) o.setMaxRate?.(vNum(maxRateHz, 'maxRateHz', 1, 60));
    if (universeId != null) { o.subscribedUniverses.clear(); o.subscribe(vUniverseId(universeId)); }
    return outputJSON(o);
  });

  ipcMain.handle('lumox:outputs:remove', (_e, id) => {
    engine.outputs.remove(id);
  });

  ipcMain.handle('lumox:outputs:available', () => OutputManager.availableTypes());
}
