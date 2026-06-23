// Scene IPC — capture / recall / remove / rename / colour / duplicate / update,
// plus type (static · chase · colorfx · movefx) and chase-step capture. Scenes
// are mix layers; recall toggles opacity (one active per bank). Tracks are built
// via `sceneTrack` so dynamic scenes always carry their FX channel targets.

import { ipcMain } from 'electron';
import { Scene, DMX_CHANNELS, TOTAL_CHANNELS, chaseStep, ChannelTypeRegistry } from '../../src/index';
import type { SceneType, FxKind, FxOrder, FxLayer } from '../../src/index';
import { engine, show, banks } from '../context';
import { updateActiveUniverses } from '../services/OutputPatchService';
import { sceneTrack } from '../services/SceneCompiler';
import { recallScene, rebuildSceneTrack } from '../services/SceneOrchestrator';
import { sceneJSON } from '../serializers';
import { vChannel, vLevel } from '../validate';

const SCENE_TYPES: SceneType[] = ['static', 'chase'];
const FX_KINDS: FxKind[] = ['color', 'move', 'curve', 'chaser', 'value', 'matrix'];
const FX_ORDERS: FxOrder[] = ['patch', 'reverse', 'mirror', 'random'];
const SCOPES: string[] = ['off', 'all', 'bank', 'outside-bank', 'specific'];
const WAVES = ['sine', 'triangle', 'sawtooth', 'square', 'random'];
const SHAPES = ['circle', 'figure8', 'line', 'square'];
const MATRIX_PATTERNS = ['wipe', 'radial', 'plasma'];
const HEX6 = /^#?[0-9a-fA-F]{6}$/;
const norm6 = (h: string): string => (h.startsWith('#') ? h.toLowerCase() : `#${h.toLowerCase()}`);

const clamp01 = (n: number): number => (n <= 0 ? 0 : n >= 1 ? 1 : n);
const clampNum = (n: number, lo: number, hi: number): number =>
  (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo);

/** Apply a kind-specific config patch to a layer (validated + clamped). */
function applyLayerConfig(L: FxLayer, p: Record<string, unknown>): void {
  const num = (v: unknown): number => Number(v);
  if (L.kind === 'color' && L.color) {
    const c = L.color;
    if (Array.isArray(p.palette)) c.palette = (p.palette as unknown[]).filter((h): h is string => typeof h === 'string' && HEX6.test(h)).map(norm6);
    if (typeof p.grayscale === 'boolean') c.grayscale = p.grayscale;
    if (p.colorWidth != null) c.colorWidth = clampNum(num(p.colorWidth), 0, 8);
    if (p.angle != null) c.angle = clampNum(num(p.angle), 0, 360);
    if (p.saturation != null) c.saturation = clamp01(num(p.saturation));
    if (p.fade != null) c.fade = clamp01(num(p.fade));
    if (typeof p.randomize === 'boolean') c.randomize = p.randomize;
  } else if (L.kind === 'move' && L.move) {
    const m = L.move;
    if (typeof p.shape === 'string' && SHAPES.includes(p.shape)) m.shape = p.shape as typeof m.shape;
    if (typeof p.symmetry === 'boolean') m.symmetry = p.symmetry;
    if (p.sizeX != null) m.sizeX = clamp01(num(p.sizeX));
    if (p.sizeY != null) m.sizeY = clamp01(num(p.sizeY));
    if (p.centerX != null) m.centerX = clampNum(Math.round(num(p.centerX)), 0, 255);
    if (p.centerY != null) m.centerY = clampNum(Math.round(num(p.centerY)), 0, 255);
    if (p.phaseShape != null) m.phaseShape = clampNum(num(p.phaseShape), 0, 360);
  } else if ((L.kind === 'curve' && L.curve) || (L.kind === 'value' && L.value)) {
    const c = (L.curve ?? L.value)!;
    if (typeof p.waveform === 'string' && WAVES.includes(p.waveform)) c.waveform = p.waveform as typeof c.waveform;
    if (typeof p.attr === 'string' && ChannelTypeRegistry.has(p.attr)) c.attr = p.attr;
    if (p.min != null) c.min = clampNum(Math.round(num(p.min)), 0, 255);
    if (p.max != null) c.max = clampNum(Math.round(num(p.max)), 0, 255);
    if (p.duty != null) c.duty = clamp01(num(p.duty));
    if (typeof p.invert === 'boolean') c.invert = p.invert;
    if (L.kind === 'value' && L.value && 'staticValue' in p) {
      L.value.staticValue = p.staticValue == null ? null : clampNum(Math.round(num(p.staticValue)), 0, 255);
    }
  } else if (L.kind === 'chaser' && L.chaser) {
    const c = L.chaser;
    if (typeof p.attr === 'string' && ChannelTypeRegistry.has(p.attr)) c.attr = p.attr;
    if (p.litCount != null) c.litCount = clampNum(Math.round(num(p.litCount)), 1, 512);
    if (p.gap != null) c.gap = clampNum(Math.round(num(p.gap)), 0, 512);
    if (p.fade != null) c.fade = clamp01(num(p.fade));
    if (p.level != null) c.level = clampNum(Math.round(num(p.level)), 0, 255);
    if (p.bg != null) c.bg = clampNum(Math.round(num(p.bg)), 0, 255);
  } else if (L.kind === 'matrix' && L.matrix) {
    const m = L.matrix;
    if (typeof p.pattern === 'string' && MATRIX_PATTERNS.includes(p.pattern)) m.pattern = p.pattern as typeof m.pattern;
    if (Array.isArray(p.palette)) m.palette = (p.palette as unknown[]).filter((h): h is string => typeof h === 'string' && HEX6.test(h)).map(norm6);
    if (p.saturation != null) m.saturation = clamp01(num(p.saturation));
    if (p.fade != null) m.fade = clamp01(num(p.fade));
    if (p.angle != null) m.angle = clampNum(num(p.angle), 0, 360);
    if (p.scale != null) m.scale = clampNum(num(p.scale), 0.05, 16);
  }
}

export function registerSceneHandlers(): void {
  ipcMain.handle('lumox:scenes:list', () => show.listScenes().map(sceneJSON));

  // Sparse stored values of one scene — { [universeId]: { [absChannel]: value } }.
  // The fader editor reads these to populate faders in EDIT mode.
  ipcMain.handle('lumox:scenes:values', (_e, id) => show.scenes.get(id)?.values ?? {});

  // Live monitor for the fader editor — whether the scene is live, its cycle
  // length, and the current MIXED OUTPUT for the given fixtures (post-mix `data`,
  // keyed { [universeId]: { [absChannel]: value } }). Lets the faders animate to
  // reflect a playing chase / movement scene. Values are only sampled while live.
  ipcMain.handle('lumox:scenes:monitor', (_e, { id, fixtureIds }) => {
    const active = engine.scenes.isLive(id);
    const tl = engine.scenes.sceneTimeline(id);
    const values: Record<number, Record<number, number>> = {};
    if (active) {
      for (const fid of (fixtureIds ?? []) as string[]) {
        const fx = show.patch.get(fid);
        if (!fx) continue;
        const u = engine.universes.get(fx.universeId);
        if (!u) continue;
        const uni = (values[fx.universeId] ??= {});
        for (let a = fx.startAddress; a <= fx.endAddress; a++) uni[a] = u.data[a - 1] ?? 0;
        for (const vd of fx.virtualDimmers()) uni[vd.virtualAddr] = u.data[vd.virtualAddr - 1] ?? 0;
      }
    }
    return { active, cycleMs: tl.cycleMs, values };
  });

  // Edit a single channel of a scene (fader editor EDIT mode). `channel` is
  // fixture-local; mapped to the universe-absolute address via the patch. For an
  // RGB-only fixture's virtual dimmer the editor passes an explicit `absChannel`
  // (a virtual-region address) instead. A null `value` removes the channel
  // (disengage). Mirrored into the live track so an active scene updates immediately.
  ipcMain.handle('lumox:scenes:setChannel', (_e, { id, fixtureId, channel, value, absChannel }) => {
    const s = show.scenes.get(id);
    const fx = show.patch.get(fixtureId);
    if (!s || !fx) return;
    let abs: number;
    if (absChannel != null) {
      abs = Number(absChannel);
      if (!fx.virtualDimmers().some((vd) => vd.virtualAddr === abs)) return;   // only the fixture's own virtual addresses
    } else {
      abs = fx.startAddress + vChannel(channel) - 1;
      if (abs < 1 || abs > DMX_CHANNELS) return;
    }

    const track = engine.scenes.tracks.get(id);
    if (value == null) {
      const uni = s.values[fx.universeId];
      if (uni) { delete uni[abs]; if (!Object.keys(uni).length) delete s.values[fx.universeId]; }
      if (track?.values[fx.universeId]) track.values[fx.universeId][abs - 1] = 0;
    } else {
      const v = vLevel(value);
      s.setValue(fx.universeId, abs, v);
      if (track) (track.values[fx.universeId] ??= new Uint8Array(TOTAL_CHANNELS))[abs - 1] = v;
    }
    updateActiveUniverses();
  });

  ipcMain.handle('lumox:scenes:capture', (_e, { name, bankId } = {}) => {
    const s = Scene.snapshot({ name: name || 'New Scene', universes: engine.universes.list(), engagedOnly: true });
    show.addScene(s);
    engine.scenes.addTrack(sceneTrack(s));
    banks.addScene(bankId, s.id);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:recall', (_e, { id, on }) => recallScene(id, on));

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

  // Change a scene's playback type. Seeds a sensible tempo and (for chase) a
  // first step from the current look, then rebuilds the live track.
  ipcMain.handle('lumox:scenes:setType', (_e, { id, type }) => {
    const s = show.scenes.get(id);
    if (!s || !SCENE_TYPES.includes(type)) return;
    s.type = type;
    if (type === 'chase') {
      s.rateMs = 500;
      if (!s.steps.length) s.steps = [chaseStep(structuredClone(s.values))];
    }
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  // Chase tempo / FX cycle period in ms.
  ipcMain.handle('lumox:scenes:setRate', (_e, { id, rateMs }) => {
    const s = show.scenes.get(id);
    if (!s) return;
    s.rateMs = Math.max(20, Math.min(60000, Math.round(rateMs) || 500));
    rebuildSceneTrack(s);
  });

  // Capture the current output as a new chase step (appended).
  ipcMain.handle('lumox:scenes:addStep', (_e, id) => {
    const s = show.scenes.get(id);
    if (!s || s.type !== 'chase') return 0;
    s.steps.push(chaseStep(Scene.snapshot({ universes: engine.universes.list(), engagedOnly: true }).values));
    rebuildSceneTrack(s);
    return s.steps.length;
  });

  // Delete a chase step by index.
  ipcMain.handle('lumox:scenes:removeStep', (_e, { id, index }) => {
    const s = show.scenes.get(id);
    if (!s || s.type !== 'chase') return 0;
    if (index >= 0 && index < s.steps.length) {
      s.steps.splice(index, 1);
      rebuildSceneTrack(s);
    }
    return s.steps.length;
  });

  // Reorder a chase step (move by ±1, clamped). Returns the new index.
  ipcMain.handle('lumox:scenes:moveStep', (_e, { id, index, delta }) => {
    const s = show.scenes.get(id);
    if (!s || s.type !== 'chase') return index;
    const to = index + (delta < 0 ? -1 : 1);
    if (index < 0 || index >= s.steps.length || to < 0 || to >= s.steps.length) return index;
    const [step] = s.steps.splice(index, 1);
    s.steps.splice(to, 0, step);
    rebuildSceneTrack(s);
    return to;
  });

  // Set a chase step's fade / wait timing (ms). Rebuilds the running track.
  ipcMain.handle('lumox:scenes:setStepTiming', (_e, { id, index, fadeMs, waitMs }) => {
    const s = show.scenes.get(id);
    if (!s || s.type !== 'chase') return null;
    const step = s.steps[index];
    if (!step) return null;
    if (fadeMs != null) step.fadeMs = clampNum(Math.round(fadeMs), 0, 600000);
    if (waitMs != null) step.waitMs = clampNum(Math.round(waitMs), 0, 600000);
    rebuildSceneTrack(s);
    return { fadeMs: step.fadeMs, waitMs: step.waitMs };
  });

  // ---- Scene Properties panel: live playback params -----------------------
  // These mutate the scene AND its running track in place (NOT rebuildSceneTrack)
  // so the live fade ramp and phase clock survive the edit. All return the
  // updated DTO so the panel re-renders from authoritative state.

  ipcMain.handle('lumox:scenes:get', (_e, id) => {
    const s = show.scenes.get(id);
    return s ? sceneJSON(s) : null;
  });

  // DIMMER — the master level the scene fades toward. Applied live (instant)
  // while the scene is showing; just stored otherwise.
  ipcMain.handle('lumox:scenes:setLevel', (_e, { id, level }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    s.level = clamp01(level);
    if (engine.scenes.isLive(id)) { engine.scenes.setOpacity(id, s.level); updateActiveUniverses(); }
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setSpeed', (_e, { id, speed }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    s.speed = clampNum(speed, 0.05, 20);
    const t = engine.scenes.tracks.get(id); if (t) t.speed = s.speed;
    return sceneJSON(s);
  });

  // Fade timing (seconds) — stored; read by recallScene on the next recall.
  ipcMain.handle('lumox:scenes:setFade', (_e, { id, fadeIn, fadeOut, fadeSpeed, phaseIn, phaseOut }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (fadeIn != null) s.fadeIn = clampNum(fadeIn, 0, 600);
    if (fadeOut != null) s.fadeOut = clampNum(fadeOut, 0, 600);
    if (fadeSpeed != null) s.fadeSpeed = clampNum(fadeSpeed, 0.1, 10);
    if (phaseIn != null) s.phaseIn = clampNum(phaseIn, 0, 600000);
    if (phaseOut != null) s.phaseOut = clampNum(phaseOut, 0, 600000);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setDrive', (_e, { id, mode, beatDiv }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (mode === 'off' || mode === 'bpm') s.driveMode = mode;
    if (beatDiv != null) s.beatDiv = clampNum(beatDiv, 0.0625, 16);
    const t = engine.scenes.tracks.get(id);
    if (t) { t.driveMode = s.driveMode; t.beatDiv = s.beatDiv; }
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setStartMode', (_e, { id, mode }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (mode === 'restart' || mode === 'continue' || mode === 'random') s.startMode = mode;
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setDirection', (_e, { id, direction }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (direction === 'forward' || direction === 'backward' || direction === 'bounce') s.direction = direction;
    const t = engine.scenes.tracks.get(id); if (t) t.direction = s.direction;
    return sceneJSON(s);
  });

  // ---- Advanced panel: priority, loop / jump, release / protect, flash ----
  // priority + loop are mirrored onto the live track so they take effect without
  // a rebuild; release/protect/flash are read by recallScene / the banks UI.

  ipcMain.handle('lumox:scenes:setPriority', (_e, { id, priority }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (priority === 'low' || priority === 'normal' || priority === 'high') s.priority = priority;
    const t = engine.scenes.tracks.get(id); if (t) t.priority = s.priority;
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setLoop', (_e, { id, mode, count }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (mode === 'always' || mode === 'count') s.loop.mode = mode;
    if (count != null) s.loop.count = clampNum(Math.round(count), 1, 9999);
    const t = engine.scenes.tracks.get(id); if (t) t.loopCount = s.loop.mode === 'count' ? s.loop.count : 0;
    const pb = engine.scenes.playback.get(id); if (pb) pb.loopDone = false;
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setJumpTo', (_e, { id, jumpTo }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (jumpTo == null) s.jumpTo = null;
    else if (jumpTo.mode === 'next' || jumpTo.mode === 'prev') s.jumpTo = { mode: jumpTo.mode };
    else if (jumpTo.mode === 'scene' && typeof jumpTo.sceneId === 'string') s.jumpTo = { mode: 'scene', sceneId: jumpTo.sceneId };
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setReleaseAtEnd', (_e, { id, on }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    s.releaseAtEnd = !!on;
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setReleaseMode', (_e, { id, mode, banks: bankIds }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (SCOPES.includes(mode)) s.releaseMode = mode;
    if (Array.isArray(bankIds)) s.releaseBanks = bankIds.filter((x: unknown): x is string => typeof x === 'string');
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setProtect', (_e, { id, mode, banks: bankIds }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    if (SCOPES.includes(mode)) s.protectFromRelease = mode;
    if (Array.isArray(bankIds)) s.protectBanks = bankIds.filter((x: unknown): x is string => typeof x === 'string');
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setFlash', (_e, { id, on }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    s.flash = !!on;
    return sceneJSON(s);
  });

  // ---- FX rack layers -----------------------------------------------------
  // Add / remove / reorder layers and edit each layer's target, order, timing
  // and kind-specific config. Each rebuilds the running track so the change is
  // heard live; returns the updated scene DTO.

  ipcMain.handle('lumox:scenes:addLayer', (_e, { id, kind }) => {
    const s = show.scenes.get(id);
    if (!s || !FX_KINDS.includes(kind)) return null;
    const layer = s.addLayer(kind);
    rebuildSceneTrack(s);
    return { scene: sceneJSON(s), layerId: layer.id };
  });

  ipcMain.handle('lumox:scenes:removeLayer', (_e, { id, layerId }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    s.removeLayer(layerId);
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:moveLayer', (_e, { id, layerId, delta }) => {
    const s = show.scenes.get(id);
    if (!s) return null;
    s.moveLayer(layerId, delta < 0 ? -1 : 1);
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setLayerEnabled', (_e, { id, layerId, enabled }) => {
    const s = show.scenes.get(id);
    const L = s?.getLayer(layerId);
    if (!s || !L) return null;
    L.enabled = !!enabled;
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setLayerTarget', (_e, { id, layerId, mode, groupId }) => {
    const s = show.scenes.get(id);
    const L = s?.getLayer(layerId);
    if (!s || !L) return null;
    L.target = mode === 'group' && groupId ? { mode: 'group', groupId }
      : mode === 'selection' ? { mode: 'selection' }
      : { mode: 'all' };
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setLayerOrder', (_e, { id, layerId, order }) => {
    const s = show.scenes.get(id);
    const L = s?.getLayer(layerId);
    if (!s || !L) return null;
    if (FX_ORDERS.includes(order)) L.order = order;
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setLayerTiming', (_e, { id, layerId, rateMs, speed, driveMode, beatDiv, direction, size, spread }) => {
    const s = show.scenes.get(id);
    const L = s?.getLayer(layerId);
    if (!s || !L) return null;
    if (rateMs != null) L.rateMs = clampNum(Math.round(rateMs), 20, 600000);
    if (speed != null) L.speed = clampNum(speed, 0.05, 20);
    if (driveMode === 'off' || driveMode === 'bpm') L.driveMode = driveMode;
    if (beatDiv != null) L.beatDiv = clampNum(beatDiv, 0.0625, 16);
    if (direction === 'forward' || direction === 'backward' || direction === 'bounce') L.direction = direction;
    if (size != null) L.size = clampNum(Math.round(size), 0, 127);
    if (spread != null) L.spread = clampNum(Math.round(spread), 0, 360);
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  ipcMain.handle('lumox:scenes:setLayerConfig', (_e, { id, layerId, ...patch }) => {
    const s = show.scenes.get(id);
    const L = s?.getLayer(layerId);
    if (!s || !L) return null;
    applyLayerConfig(L, patch);
    rebuildSceneTrack(s);
    return sceneJSON(s);
  });

  // Live FX-rack layer phase — the running playhead for one layer, so the editor
  // preview can lock its dots to the exact point the live FX is at. Null when the
  // scene isn't live (the preview then free-runs its own design-time animation).
  ipcMain.handle('lumox:scenes:layerPhase', (_e, { id, layerId }) =>
    engine.scenes.layerPhaseInfo(id, layerId));

  // Per-scene transport (runtime playhead) — pause/resume, manual stepping,
  // jump to first/last step. Affects the live track only, not stored state.
  ipcMain.handle('lumox:scenes:transport', (_e, { id, action }) => {
    const m = engine.scenes;
    switch (action) {
      case 'pause':   m.pause(id); break;
      case 'resume':  m.resume(id); break;
      case 'next':    m.stepNext(id); break;
      case 'prev':    m.stepPrev(id); break;
      case 'toStart': m.toStart(id); break;
      case 'toEnd':   m.toEnd(id); break;
    }
    const s = show.scenes.get(id);
    return s ? sceneJSON(s) : null;
  });

  ipcMain.handle('lumox:scenes:duplicate', (_e, id) => {
    const src = show.scenes.get(id);
    if (!src) return null;
    const copy = new Scene({
      name: `${src.name} copy`,
      values: structuredClone(src.values),
      type: src.type,
      steps: structuredClone(src.steps),
      rateMs: src.rateMs,
      level: src.level, speed: src.speed,
      fadeIn: src.fadeIn, fadeOut: src.fadeOut, fadeSpeed: src.fadeSpeed,
      phaseIn: src.phaseIn, phaseOut: src.phaseOut,
      driveMode: src.driveMode, beatDiv: src.beatDiv,
      startMode: src.startMode, direction: src.direction,
      layers: structuredClone(src.layers),
    });
    copy.color = src.color;
    show.addScene(copy);
    engine.scenes.addTrack(sceneTrack(copy));
    banks.insertAfter(id, copy.id);
    return sceneJSON(copy);
  });

  // Re-capture the current live output into an existing scene (keeps opacity).
  ipcMain.handle('lumox:scenes:update', (_e, id) => {
    const s = show.scenes.get(id);
    if (!s) return;
    s.values = Scene.snapshot({ universes: engine.universes.list(), engagedOnly: true }).values;
    rebuildSceneTrack(s);
  });

  // Merge the live programmer's engaged channels INTO an existing scene — overlay
  // only the manually adjusted channels, keeping the scene's other stored values
  // (unlike `update`, which replaces the whole look). Drives the fader editor's
  // "save adjusted live values into the current scene".
  ipcMain.handle('lumox:scenes:merge', (_e, id) => {
    const s = show.scenes.get(id);
    if (!s) return;
    const snap = Scene.snapshot({ universes: engine.universes.list(), engagedOnly: true });
    for (const [uni, channels] of Object.entries(snap.values)) {
      for (const [ch, v] of Object.entries(channels)) s.setValue(+uni, +ch, v as number);
    }
    rebuildSceneTrack(s);
  });
}
