// Patch IPC — fixtures patched into universes: list / add / move / remove /
// rename, plus overlap detection.

import { ipcMain } from 'electron';
import { Fixture, Group, sanitizeTransform } from '../../src/index';
import { engine, show, nextColor, configKey } from '../context';
import { rebuildFixtureMaps } from '../services/FixtureMaps';
import { ensureUniverseOutput, pruneUnusedOutputs } from '../services/OutputPatchService';
import { getSetting } from '../services/SettingsService';
import { fixtureJSON } from '../serializers';
import { vInt, vChannel, vUniverseId, vString } from '../validate';

// A universe a fixture is patched into gets a default output if it has none, so it
// appears (enabled) in the Connection patch — which lists only in-use universes.
const ensureOutput = (universeId: number): void =>
  ensureUniverseOutput(universeId, {
    protocol: getSetting('dmxProtocol'),
    host: getSetting('broadcastHost'),
    maxRateHz: getSetting('maxRateHz'),
  });

export function registerPatchHandlers(): void {
  ipcMain.handle('lumox:patch:list', () => show.patch.list().map(fixtureJSON));

  // Add `count` fixtures of a definition/mode, packing them consecutively from
  // `startAddress`. Returns the created fixtures (serialized).
  ipcMain.handle('lumox:patch:add', async (_e, { definitionId, modeId, universeId, startAddress, count = 1, name, index = 1 }) => {
    vUniverseId(universeId);
    vChannel(startAddress, 'startAddress');
    vInt(count, 'count', 1, 512);
    vInt(index, 'index', 0, 100000);
    const defId = vString(definitionId, 'definitionId');
    const def = await show.library.ensure(defId);   // lazy-load the vendor if needed
    if (!def) throw new Error(`Unknown fixture definition: ${defId}`);
    const mode = modeId ? def.mode(modeId) : def.defaultMode;
    if (!mode) throw new Error(`Definition ${definitionId} has no mode ${modeId}`);

    engine.universes.ensure(universeId, `Universe ${universeId + 1}`);
    ensureOutput(universeId);

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

    // Seed each new fixture's virtual dimmers to full so an RGB-only fixture
    // shows colour at 100% by default (the engine rests them at full).
    for (const fx of created) { const u = engine.universes.get(fx.universeId); if (u) fx.applyVirtual(u); }
    rebuildFixtureMaps();   // new fixtures may need virtual-dimmer targets
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
    if (oldUni) {
      for (let a = fx.startAddress; a <= fx.endAddress; a++) oldUni.setChannel(a, 0);
      for (const vd of fx.virtualDimmers()) oldUni.setChannel(vd.virtualAddr, 0);   // clear stale virtual-dimmer slots
    }
    fx.universeId = uni;
    fx.startAddress = startAddress;
    const newUni = engine.universes.ensure(uni, `Universe ${uni + 1}`);
    ensureOutput(uni);
    if (newUni) fx.apply(newUni);
    pruneUnusedOutputs();   // the old universe may now be empty → close its output
    rebuildFixtureMaps();   // addresses / universe changed — re-resolve limit + virtual-dimmer targets
    return fixtureJSON(fx);
  });

  ipcMain.handle('lumox:patch:remove', (_e, id) => {
    show.patch.remove(id);
    show.groups.purgeFixture(id);
    show.purgeFixtureFromSelections(id);   // and from any saved selection
    // drop now-empty auto-groups
    for (const g of show.groups.list()) if (g.size === 0) show.groups.remove(g.id);
    // drop now-empty saved selections
    for (const s of show.listSelections()) if (!s.fixtureIds.length) show.removeSelection(s.id);
    pruneUnusedOutputs();   // universe may now be empty → close its output
    rebuildFixtureMaps();   // fixture gone — drop its limit + virtual-dimmer targets
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

  // Like setTransform, but for the stage's deterministic auto-placement of
  // never-positioned fixtures on load. It's a derived layout (re-computed
  // identically every load), not a user edit, so it lives on a TRANSIENT channel
  // that does NOT dirty the project — otherwise every fresh boot would be dirty.
  ipcMain.handle('lumox:patch:placeInitial', (_e, { id, transform }) => {
    const fx = show.patch.get(id);
    if (!fx) return;
    fx.stageTransform = sanitizeTransform({ ...fx.stageTransform, ...transform });
  });

  ipcMain.handle('lumox:patch:overlaps', () => show.patch.detectOverlaps());
}
