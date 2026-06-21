// Serializers — map engine objects to the plain-JSON DTOs the renderer consumes
// (see dto.ts). One place for all engine → IPC mapping, so a DTO shape changes
// here, not inline across handlers.

import type { FixtureDefinition, Fixture, Group, Scene, Output, Bank, FxLayer, SavedSelection } from '../src/index';
import { engine, show, configKey } from './context';
import type { DefDTO, FixtureDTO, GroupDTO, SelectionDTO, SceneDTO, BankDTO, OutputDTO, FxLayerDTO } from './dto';

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
  const focus = fx.definition.physical?.focus ?? null;
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
    channels: [
      ...fx.mode.channels.map((c, i) => ({
        index: i + 1,
        name: c?.name ?? '—',
        typeId: c?.typeId ?? null,
        group: c?.type?.group ?? null,
        color: c?.type?.color ?? null,
        isIntensity: !!c?.type?.isIntensity,
        // Profile-defined value ranges (gobo / colour-wheel / shutter / macro
        // presets). Drives the fader editor's per-channel preset chips.
        caps: (c?.capabilities ?? []).map((cap) => ({
          min: cap.min, max: cap.max, label: cap.label, kind: cap.kind,
          color: typeof cap.color === 'string' ? cap.color : null,
          // Drawn mono gobo icon (g16:… bitmask) — lets the GOBO fader strip show
          // the selected gobo's shape instead of a generic glyph.
          pattern: typeof cap.pattern === 'string' ? cap.pattern : null,
        })),
      })),
      // Synthetic virtual dimmers (RGB-only fixtures) — one fader per colour
      // cluster, addressed in the virtual region (absAddress), shown in the
      // DIMMER group. Not real DMX channels, so they keep their own indices.
      // `afterIndex` is the cluster's last real channel (its blue), so the
      // renderer can place this dimmer's expander right after that cluster.
      ...fx.virtualDimmers().map((vd, k, arr) => ({
        index: fx.channelCount + k + 1,
        name: arr.length > 1 ? `Virtual Dim ${k + 1}` : 'Virtual Dim',
        typeId: 'intensity',
        group: 'intensity',
        color: null,
        isIntensity: true,
        isVirtual: true,
        absAddress: vd.virtualAddr,
        afterIndex: Math.max(vd.r, vd.g, vd.b, vd.w ?? 0) - fx.startAddress + 1,
      })),
    ],
    panMaxDeg: focus?.panMax ?? null,
    tiltMaxDeg: focus?.tiltMax ?? null,
    transform: { ...fx.stageTransform },
    limits: fx.limits ?? null,
  };
}

export function groupJSON(g: Group): GroupDTO {
  return { id: g.id, name: g.name, color: g.color, configKey: g.configKey ?? null, fixtureIds: g.list() };
}

export function selectionJSON(s: SavedSelection): SelectionDTO {
  // prune to currently-patched fixtures so the UI never shows ghosts
  return { id: s.id, name: s.name, fixtureIds: s.fixtureIds.filter((id) => !!show.patch.get(id)) };
}

function layerJSON(l: FxLayer, beams: number, beamFixtureIds: string[]): FxLayerDTO {
  return {
    id: l.id, kind: l.kind, enabled: l.enabled, target: l.target, order: l.order,
    rateMs: l.rateMs, speed: l.speed, driveMode: l.driveMode, beatDiv: l.beatDiv,
    direction: l.direction, size: l.size, spread: l.spread, beams, beamFixtureIds,
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

// Fixture id behind each target beam, flattened in the SAME universe order as
// `layerBeams` counts them — so it is index-aligned with the preview's beams.
function layerBeamFixtureIds(track: ReturnType<typeof engine.scenes.tracks.get>, i: number): string[] {
  const t = track?.layers?.[i]?.targets;
  const ids = track?.layers?.[i]?.beamIds;
  if (!t || !ids) return [];
  const out: string[] = [];
  for (const uid of Object.keys(t)) out.push(...(ids[Number(uid)] ?? []));
  return out;
}

// Fixtures a scene drives (patch order) — those with a captured value anywhere in
// their DMX footprint (base look or any chase step) PLUS any fixture an FX layer
// targets (a pure-FX scene, e.g. a matrix look, stores no static values yet still
// drives its rig via the layer's `beamIds`). Lets selecting a scene auto-select
// its fixtures on the stage for editing.
function sceneFixtureIds(s: Scene, track: ReturnType<typeof engine.scenes.tracks.get>): string[] {
  const fxIds = new Set<string>();
  for (const tl of track?.layers ?? [])
    for (const uid of Object.keys(tl.beamIds ?? {}))
      for (const fid of tl.beamIds![Number(uid)] ?? []) fxIds.add(fid);
  const looks: Record<number, Record<number, number>>[] = [s.values, ...s.steps.map((st) => st.values)];
  const out: string[] = [];
  for (const f of show.patch.list()) {
    const inLook = looks.some((vals) => {
      const chans = vals[f.universeId];
      if (!chans) return false;
      for (let c = 0; c < f.channelCount; c++) if (chans[f.startAddress + c] !== undefined) return true;
      return false;
    });
    if (inLook || fxIds.has(f.id)) out.push(f.id);
  }
  return out;
}

export function sceneJSON(s: Scene): SceneDTO {
  const track = engine.scenes.tracks.get(s.id);
  const opacity = track?.opacity ?? 0;
  const tl = engine.scenes.sceneTimeline(s.id);   // live cycle + phase of the primary motion
  return {
    id: s.id, name: s.name, color: s.color ?? '#e0564b', opacity, active: engine.scenes.isLive(s.id),
    type: s.type, stepCount: s.steps.length,
    steps: s.steps.map((st) => ({ fadeMs: st.fadeMs, waitMs: st.waitMs })),
    layers: s.layers.map((l, i) => layerJSON(l, layerBeams(track, i), layerBeamFixtureIds(track, i))),
    fixtureIds: sceneFixtureIds(s, track),
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
