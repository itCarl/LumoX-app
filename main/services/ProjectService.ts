// ProjectService — (de)serialization of the whole show to/from the `.lumox`
// project format. Pure domain logic: no Electron, no file dialogs (the
// project IPC handler owns the dialog + fs I/O and delegates here).

import { Fixture, Group, Scene } from '../../src/index';
import {
  engine, show, banks, setBroadcastOutput, updateActiveUniverses,
} from '../context';
import { outputJSON } from '../serializers';
import type { ProjectData } from '../dto';

const PROJECT_FORMAT = 'lumox-project';
const PROJECT_VERSION = 1;

/** Snapshot the current show into a serializable project object. */
export function buildProject(): ProjectData {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    library: show.library.list().filter((d) => d.source === 'user').map((d) => d.toJSON()),
    patch: show.patch.list().map((fx) => fx.toJSON()),
    groups: show.groups.list().map((g) => ({ ...g.toJSON(), configKey: g.configKey ?? null })),
    scenes: show.listScenes().map((s) => ({
      id: s.id, name: s.name, color: s.color ?? null, values: s.values, fadeIn: s.fadeIn, fadeOut: s.fadeOut,
    })),
    banks: banks.toJSON(),
    devices: engine.outputs.list().map(outputJSON),
  };
}

/**
 * Validate a parsed project before mutating any engine state. Rejecting
 * malformed input up-front avoids half-applied loads from untrusted files.
 */
export function validateProject(p: unknown): asserts p is ProjectData {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    throw new Error('Not a Lumox project file');
  }
  const o = p as Record<string, unknown>;
  if (o.format !== PROJECT_FORMAT) throw new Error('Not a Lumox project file');
  if (!Number.isInteger(o.version) || (o.version as number) < 1) {
    throw new Error(`Unsupported project version: ${o.version}`);
  }
  // Optional sections must be arrays when present.
  for (const key of ['library', 'patch', 'groups', 'scenes', 'banks', 'devices'] as const) {
    if (o[key] != null && !Array.isArray(o[key])) {
      throw new Error(`Invalid project: "${key}" must be an array`);
    }
  }
}

/** Replace all show state from a parsed project (validates first). */
export async function restoreProject(p: unknown): Promise<void> {
  validateProject(p);

  // user fixture definitions
  for (const d of p.library ?? []) { try { show.library.add(d, 'user'); } catch { /* skip */ } }

  // patch
  show.patch.clear();
  for (const fj of p.patch ?? []) {
    const def = show.library.get(fj.definitionId);
    if (!def) continue;
    const mode = def.mode(fj.modeId) ?? def.defaultMode;
    const fx = new Fixture({ id: fj.id, name: fj.name, definition: def, mode, universeId: fj.universeId, startAddress: fj.startAddress });
    show.patch.add(fx);
    const u = engine.universes.get(fx.universeId);
    if (u) fx.apply(u);
  }

  // groups
  show.groups.clear();
  for (const gj of p.groups ?? []) {
    const g = show.groups.add(new Group(gj));
    g.configKey = gj.configKey ?? null;
  }

  // scenes
  engine.scenes.clear();
  show.clearScenes();
  for (const sj of p.scenes ?? []) {
    const s = new Scene({ id: sj.id, name: sj.name, values: sj.values, fadeIn: sj.fadeIn, fadeOut: sj.fadeOut });
    s.color = sj.color ?? undefined;
    show.addScene(s);
    engine.scenes.addTrack(s.toMixerTrack({ blend: 'htp', opacity: 0 }));
  }

  // banks
  banks.load(p.banks ?? []);
  banks.ensureDefault();

  // devices (outputs)
  for (const o of engine.outputs.list()) engine.outputs.remove(o.id);
  for (const dj of p.devices ?? []) {
    const out = engine.outputs.create(dj.type || 'artnet', {
      name: dj.name, host: dj.host, maxRateHz: dj.maxRateHz,
      subscribedUniverses: dj.subscribedUniverses ?? [],
    });
    await out.open().catch(() => {});
    if (dj.name === 'Broadcast') setBroadcastOutput(out);
  }
  updateActiveUniverses();
}
