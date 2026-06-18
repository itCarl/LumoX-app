// Serializers — map engine objects to the plain-JSON DTOs the renderer consumes
// (see dto.ts). One place for all engine → IPC mapping, so a DTO shape changes
// here, not inline across handlers.

import type { FixtureDefinition, Fixture, Group, Scene, Output, Bank } from '../src/index';
import { engine, show, configKey } from './context';
import type { DefDTO, FixtureDTO, GroupDTO, SceneDTO, BankDTO, OutputDTO } from './dto';

export function defJSON(def: FixtureDefinition): DefDTO {
  return {
    id: def.id,
    manufacturer: def.manufacturer ?? '',
    model: def.model ?? '',
    type: def.type,
    emitters: def.emitters ?? 1,
    source: def.source ?? 'builtin',
    modes: def.modes.map((m) => ({ id: m.id, name: m.name, channelCount: m.channelCount })),
  };
}

export function fixtureJSON(fx: Fixture): FixtureDTO {
  const group = show.groups.containing(fx.id)[0] ?? null;
  return {
    id: fx.id,
    name: fx.name,
    color: group?.color ?? '#6b6b6b', // colour comes from the group
    definitionId: fx.definition.id,
    model: fx.definition.model ?? '',
    type: fx.definition.type,
    emitters: fx.definition.emitters ?? 1,
    modeId: fx.mode.id,
    modeName: fx.mode.name,
    configKey: configKey(fx),
    groupId: group?.id ?? null,
    groupName: group?.name ?? null,
    universeId: fx.universeId,
    startAddress: fx.startAddress,
    endAddress: fx.endAddress,
    channelCount: fx.channelCount,
    channels: fx.mode.channels.map((c, i) => ({
      index: i + 1,
      name: c?.name ?? '—',
      typeId: c?.typeId ?? null,
      group: c?.type?.group ?? null,
      color: c?.type?.color ?? null,
    })),
  };
}

export function groupJSON(g: Group): GroupDTO {
  return { id: g.id, name: g.name, color: g.color, configKey: g.configKey ?? null, fixtureIds: g.list() };
}

export function sceneJSON(s: Scene): SceneDTO {
  const track = engine.scenes.tracks.get(s.id);
  const opacity = track?.opacity ?? 0;
  return { id: s.id, name: s.name, color: s.color ?? '#e0564b', opacity, active: opacity > 0 };
}

export function bankJSON(b: Bank): BankDTO {
  return {
    id: b.id,
    name: b.name,
    scenes: b.sceneIds
      .map((id) => show.scenes.get(id))
      .filter((s): s is Scene => !!s)
      .map(sceneJSON),
  };
}

export function outputJSON(o: Output & { host?: string; port?: number }): OutputDTO {
  return {
    id: o.id, name: o.name, type: o.type, enabled: o.enabled, isOpen: o.isOpen,
    host: o.host ?? null, port: o.port ?? null,
    maxRateHz: o.maxRateHz ?? null,
    subscribedUniverses: [...o.subscribedUniverses],
  };
}
