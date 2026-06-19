// Serializers — map engine objects to the plain-JSON DTOs the renderer consumes
// (see dto.ts). One place for all engine → IPC mapping, so a DTO shape changes
// here, not inline across handlers.

import type { FixtureDefinition, Fixture, Group, Scene, Output, Bank, FxLayer } from '../src/index';
import { engine, show, configKey } from './context';
import type { DefDTO, FixtureDTO, GroupDTO, SceneDTO, BankDTO, OutputDTO, FxLayerDTO } from './dto';

export function defJSON(def: FixtureDefinition): DefDTO {
  return {
    id: def.id,
    manufacturer: def.manufacturer ?? '',
    model: def.model ?? '',
    type: def.type,
    emitters: def.emitters ?? 1,
    emitterLayout: def.emitterLayout ?? null,
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
    emitters: fx.emitterCount,   // derived from THIS mode's channel layout (colour clusters)
    emitterLayout: fx.definition.emitterLayout ?? null,
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
    transform: { ...fx.stageTransform },
  };
}

export function groupJSON(g: Group): GroupDTO {
  return { id: g.id, name: g.name, color: g.color, configKey: g.configKey ?? null, fixtureIds: g.list() };
}

function layerJSON(l: FxLayer, beams: number): FxLayerDTO {
  return {
    id: l.id, kind: l.kind, enabled: l.enabled, target: l.target, order: l.order,
    rateMs: l.rateMs, speed: l.speed, driveMode: l.driveMode, beatDiv: l.beatDiv,
    direction: l.direction, size: l.size, spread: l.spread, beams,
    color: l.color ? { ...l.color, palette: [...l.color.palette] } : undefined,
    move: l.move ? { ...l.move } : undefined,
    curve: l.curve ? { ...l.curve } : undefined,
    chaser: l.chaser ? { ...l.chaser } : undefined,
    value: l.value ? { ...l.value } : undefined,
    matrix: l.matrix ? { ...l.matrix, palette: [...l.matrix.palette] } : undefined,
  };
}

// Count of target beams the app attached to layer `i` of the running track.
function layerBeams(track: ReturnType<typeof engine.scenes.tracks.get>, i: number): number {
  const t = track?.layers?.[i]?.targets;
  if (!t) return 0;
  let n = 0;
  for (const uid of Object.keys(t)) n += t[Number(uid)].length;
  return n;
}

export function sceneJSON(s: Scene): SceneDTO {
  const track = engine.scenes.tracks.get(s.id);
  const opacity = track?.opacity ?? 0;
  const tl = engine.scenes.sceneTimeline(s.id);   // live cycle + phase of the primary motion
  return {
    id: s.id, name: s.name, color: s.color ?? '#e0564b', opacity, active: opacity > 0,
    type: s.type, stepCount: s.steps.length,
    steps: s.steps.map((st) => ({ fadeMs: st.fadeMs, waitMs: st.waitMs })),
    layers: s.layers.map((l, i) => layerJSON(l, layerBeams(track, i))),
    level: s.level, speed: s.speed,
    fadeIn: s.fadeIn, fadeOut: s.fadeOut, fadeSpeed: s.fadeSpeed,
    phaseIn: s.phaseIn, phaseOut: s.phaseOut,
    driveMode: s.driveMode, beatDiv: s.beatDiv,
    startMode: s.startMode, direction: s.direction,
    paused: engine.scenes.paused(s.id),
    // Live scene-timeline readout: visible cycle length (0 = not periodic) and
    // the current phase position within it, from whatever drives the motion.
    cycleMs: tl.cycleMs,
    phaseMs: tl.phaseMs,
    priority: s.priority, loop: { ...s.loop }, jumpTo: s.jumpTo ? { ...s.jumpTo } : null,
    releaseAtEnd: s.releaseAtEnd, releaseMode: s.releaseMode, releaseBanks: [...s.releaseBanks],
    protectFromRelease: s.protectFromRelease, protectBanks: [...s.protectBanks], flash: s.flash,
  };
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
    frameMode: o.frameMode,
    subscribedUniverses: [...o.subscribedUniverses],
  };
}
