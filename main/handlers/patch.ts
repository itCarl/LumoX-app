// Patch IPC — fixtures patched into universes: list / add / move / remove /
// rename, plus overlap detection.

import { ipcMain } from 'electron';
import { Fixture, Group, sanitizeTransform } from '../../src/index';
import { engine, show, nextColor, configKey, rebuildLimits } from '../context';
import { fixtureJSON } from '../serializers';
import { vInt, vChannel, vUniverseId, vString } from '../validate';

export function registerPatchHandlers(): void {
  ipcMain.handle('lumox:patch:list', () => show.patch.list().map(fixtureJSON));

  // Add `count` fixtures of a definition/mode, packing them consecutively from
  // `startAddress`. Returns the created fixtures (serialized).
  ipcMain.handle('lumox:patch:add', (_e, { definitionId, modeId, universeId, startAddress, count = 1, name, index = 1 }) => {
    vUniverseId(universeId);
    vChannel(startAddress, 'startAddress');
    vInt(count, 'count', 1, 512);
    vInt(index, 'index', 0, 100000);
    const def = show.library.get(vString(definitionId, 'definitionId'));
    if (!def) throw new Error(`Unknown fixture definition: ${definitionId}`);
    const mode = modeId ? def.mode(modeId) : def.defaultMode;
    if (!mode) throw new Error(`Definition ${definitionId} has no mode ${modeId}`);

    engine.universes.ensure(universeId, `Universe ${universeId + 1}`);

    // Overlap / bounds guard — reject if any requested slot is out of the
    // 1..512 range or already occupied on this universe.
    const span = mode.channelCount;
    const occupied = new Uint8Array(513); // 1-based
    for (const f of show.patch.forUniverse(universeId)) {
      for (let a = f.startAddress; a <= f.endAddress && a <= 512; a++) occupied[a] = 1;
    }
    const total = span * count;
    if (startAddress < 1 || startAddress + total - 1 > 512) {
      throw new Error(`Out of range: ${count}×${span}ch from ${startAddress} exceeds channel 512`);
    }
    for (let a = startAddress; a < startAddress + total; a++) {
      if (occupied[a]) throw new Error(`Address ${a} already patched on universe ${universeId + 1}`);
    }

    const created: Fixture[] = [];
    let addr = startAddress;
    for (let i = 0; i < count; i++) {
      const base = name ?? def.model;
      const fx = new Fixture({
        name: count > 1 ? `${base} ${index + i}` : base,
        definition: def, mode,
        universeId, startAddress: addr,
      });
      show.patch.add(fx);
      created.push(fx);
      addr += mode.channelCount;
    }

    // Each patch operation gets its own group (single or bulk). Identical
    // config alone does NOT auto-join an existing group.
    if (created.length) {
      const g = show.groups.add(new Group({
        name: `${def.model}`,
        color: nextColor(),
        fixtureIds: created.map((fx) => fx.id),
      }));
      g.configKey = configKey(created[0]);
    }

    return created.map(fixtureJSON);
  });

  // Move a patched fixture to a new start address (drag within the grid).
  ipcMain.handle('lumox:patch:move', (_e, { id, universeId, startAddress }) => {
    const fx = show.patch.get(id);
    if (!fx) throw new Error('Unknown fixture');
    const uni = universeId ?? fx.universeId;
    const span = fx.channelCount;
    if (startAddress < 1 || startAddress + span - 1 > 512) {
      throw new Error(`Out of range: ${span}ch from ${startAddress} exceeds channel 512`);
    }
    const occupied = new Uint8Array(513);
    for (const o of show.patch.forUniverse(uni)) {
      if (o.id === id) continue;                  // ignore self
      for (let a = o.startAddress; a <= o.endAddress && a <= 512; a++) occupied[a] = 1;
    }
    for (let a = startAddress; a < startAddress + span; a++) {
      if (occupied[a]) throw new Error(`Address ${a} already patched on universe ${uni + 1}`);
    }
    // clear old output, move, re-apply
    const oldUni = engine.universes.get(fx.universeId);
    if (oldUni) for (let a = fx.startAddress; a <= fx.endAddress; a++) oldUni.setChannel(a, 0);
    fx.universeId = uni;
    fx.startAddress = startAddress;
    const newUni = engine.universes.ensure(uni, `Universe ${uni + 1}`);
    if (newUni) fx.apply(newUni);
    rebuildLimits();   // addresses / universe changed — re-resolve limit targets
    return fixtureJSON(fx);
  });

  ipcMain.handle('lumox:patch:remove', (_e, id) => {
    show.patch.remove(id);
    show.groups.purgeFixture(id);
    // drop now-empty auto-groups
    for (const g of show.groups.list()) if (g.size === 0) show.groups.remove(g.id);
    rebuildLimits();   // fixture gone — drop its limit targets
  });

  ipcMain.handle('lumox:patch:rename', (_e, { id, name }) => {
    const fx = show.patch.get(id);
    if (fx) fx.name = name;
  });

  // Update a fixture's 2D stage placement (drag / rotate on the STAGE tile).
  // Accepts a partial transform; missing fields keep their current value.
  ipcMain.handle('lumox:patch:setTransform', (_e, { id, transform }) => {
    const fx = show.patch.get(id);
    if (!fx) return;
    fx.stageTransform = sanitizeTransform({ ...fx.stageTransform, ...transform });
  });

  ipcMain.handle('lumox:patch:overlaps', () => show.patch.detectOverlaps());
}
