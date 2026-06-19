// Output IPC — the per-universe output patch. Each engine universe can have one
// output (protocol + target IP + frame mode + rate cap); the patch is persisted
// per project (ProjectService `devices`). See context.ts for the lifecycle.

import { ipcMain } from 'electron';
import { OutputManager } from '../../src/index';
import type { FrameMode } from '../../src/index';
import { engine, setUniverseOutput, removeUniverseOutput, outputForUniverse, addUniverse } from '../context';
import { outputJSON } from '../serializers';
import { markDirty } from '../services/ProjectService';
import { getSetting } from '../services/SettingsService';
import { vNum, vUniverseId, vHost } from '../validate';

const FRAME_MODES: FrameMode[] = ['standard', 'full', 'partial'];
const vFrameMode = (m: unknown): FrameMode => (FRAME_MODES.includes(m as FrameMode) ? (m as FrameMode) : 'standard');
const vProtocol = (p: unknown): string => (p === 'sacn' ? 'sacn' : 'artnet');

export function registerOutputHandlers(): void {
  ipcMain.handle('lumox:outputs:available', () => OutputManager.availableTypes());

  // Raw output list (low-level status); each per-universe output appears here.
  ipcMain.handle('lumox:outputs:list', () => engine.outputs.list().map(outputJSON));

  // The output patch — one entry per engine universe (its configured output, or
  // a default-disabled placeholder), with live transmit status.
  ipcMain.handle('lumox:outputs:patch', () => {
    const dProto = getSetting('dmxProtocol');
    const dHost = getSetting('broadcastHost');
    const dRate = getSetting('maxRateHz');
    return engine.universes.list().map((u) => {
      const o = outputForUniverse(u.id);
      if (!o) {
        return {
          universeId: u.id, universeName: u.name, protocol: dProto, host: dHost,
          frameMode: 'standard' as FrameMode, maxRateHz: dRate,
          enabled: false, isOpen: false, transmitting: false,
        };
      }
      return {
        universeId: u.id, universeName: u.name, protocol: o.type,
        host: (o as { host?: string | null }).host ?? '', frameMode: o.frameMode,
        maxRateHz: o.maxRateHz ?? dRate, enabled: o.enabled, isOpen: o.isOpen,
        transmitting: o.enabled && o.isOpen && o.subscribesTo(u.id),
      };
    });
  });

  // Create / update one universe's output.
  ipcMain.handle('lumox:outputs:setUniverse', (_e, cfg) => {
    const protocol = vProtocol(cfg?.protocol);
    setUniverseOutput({
      universeId: vUniverseId(cfg?.universeId),
      protocol,
      host: protocol === 'artnet' ? vHost(cfg?.host || '255.255.255.255') : '',
      frameMode: vFrameMode(cfg?.frameMode),
      maxRateHz: vNum(cfg?.maxRateHz ?? 40, 'maxRateHz', 1, 60),
      enabled: cfg?.enabled !== false,
    });
    markDirty();
  });

  // Remove one universe's output (stop transmitting it entirely).
  ipcMain.handle('lumox:outputs:removeUniverse', (_e, { universeId }) => {
    removeUniverseOutput(vUniverseId(universeId));
    markDirty();
  });

  // Append a new universe with a default output (Connection tab "Add universe").
  ipcMain.handle('lumox:outputs:addUniverse', () => {
    const id = addUniverse({
      protocol: getSetting('dmxProtocol'),
      host: getSetting('broadcastHost'),
      maxRateHz: getSetting('maxRateHz'),
    });
    if (id >= 0) markDirty();
    return id;
  });
}
