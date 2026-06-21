import { TOTAL_CHANNELS } from '../core/Universe';

/** Sparse channel values: { [universeId]: { [channel]: value } } (1-based). */
export type SceneValues = Record<number, Record<number, number>>;

/**
 * One chase step — a captured look plus its own timing:
 *   fadeMs — crossfade INTO this step from the previous one
 *   waitMs — dwell at this step after the fade completes
 * A chase's free-run cycle is the sum of every step's (fadeMs + waitMs).
 */
export interface ChaseStep {
  values: SceneValues;
  fadeMs: number;
  waitMs: number;
}

/**
 * Scene playback type:
 *   static  — a fixed look (the captured `values`)
 *   chase   — steps through `steps` (each a captured look) at `rateMs`
 *   colorfx — palette / rainbow sweep across colour fixtures
 *   movefx  — shape-based pan/tilt path across moving fixtures
 *   curvefx — a waveform modulating intensity across fixtures
 */
export type SceneType = 'static' | 'chase';

/** MOVE FX path shape. */
export type MoveShape = 'circle' | 'figure8' | 'line' | 'square';
/** CURVE / VALUE FX waveform. */
export type CurveWave = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'random';

/** An effect-layer kind in a scene's FX rack. */
export type FxKind = 'color' | 'move' | 'curve' | 'chaser' | 'value' | 'matrix';
/** MATRIX FX spatial pattern — how colour is derived from an emitter's position. */
export type MatrixPattern = 'wipe' | 'radial' | 'plasma';
/** Which fixtures a layer sweeps across — the whole rig (patch order), a named
 *  group (membership order), or the live programmer selection (selection order). */
export type FxTargetSel = { mode: 'all' } | { mode: 'group'; groupId: string } | { mode: 'selection' };
/** Per-fixture sweep order ('index') — how an effect fans across the selection. */
export type FxOrder = 'patch' | 'reverse' | 'mirror' | 'random';

/** COLOR FX config — empty palette ⇒ full-spectrum rainbow. */
export interface ColorFxConfig {
  palette: string[];      // hex colours sampled as a gradient across the rig
  grayscale: boolean;     // collapse to luminance
  colorWidth: number;     // 0..1 — how compressed the gradient is across the rig
  angle: number;          // 0..360 — base hue / position offset
  saturation: number;     // 0..1 — colour saturation (1 = full)
  fade: number;           // 0..1 — softness between palette stops (1 = smooth, 0 = hard)
  randomize: boolean;     // scatter each fixture's gradient position
}
/** MOVE FX config. */
export interface MoveFxConfig {
  shape: MoveShape;
  symmetry: boolean;      // mirror alternate fixtures
  sizeX: number;          // 0..1 — pan amplitude scale
  sizeY: number;          // 0..1 — tilt amplitude scale
  centerX: number;        // 0..255 — pan home (default 128)
  centerY: number;        // 0..255 — tilt home (default 128)
  phaseShape: number;     // 0..360 — path rotation (deg)
}
/** CURVE FX config — a waveform mapped into [min,max] on the target attribute. */
export interface CurveFxConfig {
  waveform: CurveWave;
  attr: string;           // channel-type id to drive (default 'intensity')
  min: number;            // 0..255 output floor
  max: number;            // 0..255 output ceiling
  duty: number;           // 0..1 — square-wave duty cycle
  invert: boolean;        // flip the waveform
}
/** CHASER FX config — a lit window walking across the selection. */
export interface ChaserFxConfig {
  attr: string;           // channel-type id lit in the window (default 'intensity')
  litCount: number;       // fixtures lit at once (>= 1)
  gap: number;            // dark fixtures between lit ones (>= 0)
  fade: number;           // 0..1 — tail softness
  level: number;          // 0..255 — lit value
  bg: number;             // 0..255 — unlit value
}
/** VALUE FX config — a generalised waveform on an arbitrary attribute. */
export interface ValueFxConfig {
  attr: string;           // channel-type id to drive (default 'intensity')
  waveform: CurveWave;
  min: number;            // 0..255
  max: number;            // 0..255
  duty: number;           // 0..1
  invert: boolean;
  staticValue: number | null;  // when set (0..255), hold a flat value instead of animating
}
/**
 * MATRIX FX config — a per-emitter colour field driven by each emitter's 2D
 * world position on the STAGE (true pixel-mapping). `pattern` shapes the field,
 * `scale` is its spatial frequency across the rig, `angle` aims a wipe, and the
 * look scrolls over time. Empty palette ⇒ full-spectrum rainbow.
 */
export interface MatrixFxConfig {
  pattern: MatrixPattern;
  palette: string[];      // hex colours sampled as a gradient (empty = rainbow)
  saturation: number;     // 0..1
  fade: number;           // 0..1 — softness between palette stops
  angle: number;          // 0..360 — wipe direction (deg)
  scale: number;          // spatial frequency — cycles across the rig (>0)
}

export const DEFAULT_COLOR_FX: ColorFxConfig = { palette: [], grayscale: false, colorWidth: 1, angle: 0, saturation: 1, fade: 1, randomize: false };
export const DEFAULT_MOVE_FX: MoveFxConfig = { shape: 'circle', symmetry: false, sizeX: 1, sizeY: 1, centerX: 128, centerY: 128, phaseShape: 0 };
export const DEFAULT_CURVE_FX: CurveFxConfig = { waveform: 'sine', attr: 'intensity', min: 0, max: 255, duty: 0.5, invert: false };
export const DEFAULT_CHASER_FX: ChaserFxConfig = { attr: 'intensity', litCount: 1, gap: 0, fade: 0, level: 255, bg: 0 };
export const DEFAULT_VALUE_FX: ValueFxConfig = { attr: 'intensity', waveform: 'sine', min: 0, max: 255, duty: 0.5, invert: false, staticValue: null };
export const DEFAULT_MATRIX_FX: MatrixFxConfig = { pattern: 'wipe', palette: [], saturation: 1, fade: 1, angle: 0, scale: 1 };

/**
 * One effect layer in a scene's FX rack. Each layer is self-contained: its own
 * kind, target selection + sweep order, timing, and the config for its kind.
 * Layers are applied bottom→top over the scene's base look.
 */
export interface FxLayer {
  id: string;
  kind: FxKind;
  enabled: boolean;
  target: FxTargetSel;
  order: FxOrder;
  rateMs: number;
  speed: number;
  driveMode: SceneDriveMode;
  beatDiv: number;
  direction: SceneDirection;
  size: number;           // move amplitude (0..127)
  spread: number;         // per-fixture phase offset (deg)
  color?: ColorFxConfig;
  move?: MoveFxConfig;
  curve?: CurveFxConfig;
  chaser?: ChaserFxConfig;
  value?: ValueFxConfig;
  matrix?: MatrixFxConfig;
}

/** Tempo source for dynamic scenes — free-run or synced to the master BPM. */
export type SceneDriveMode = 'off' | 'bpm';
/** Phase-clock behaviour when a scene is recalled. */
export type SceneStartMode = 'restart' | 'continue' | 'random';
/** Playback direction for chases / FX sweeps. */
export type SceneDirection = 'forward' | 'backward' | 'bounce';

/** Blend priority — a higher tier wins over a lower one on shared channels. */
export type ScenePriority = 'low' | 'normal' | 'high';
/** Loop termination — run forever, or stop after `count` cycles. */
export type SceneLoop = { mode: 'always' | 'count'; count: number };
/** What to trigger when a counted loop finishes (null = nothing). */
export type SceneJump = { mode: 'next' | 'prev' | 'scene'; sceneId?: string } | null;
/** Release / protect scope — which scenes a recall releases, or a scene shields against. */
export type ReleaseScope = 'off' | 'all' | 'bank' | 'outside-bank' | 'specific';

const PRIORITIES: ScenePriority[] = ['low', 'normal', 'high'];
const SCOPES: ReleaseScope[] = ['off', 'all', 'bank', 'outside-bank', 'specific'];
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
function normalizeLoop(l?: SceneLoop): SceneLoop {
  if (l && (l.mode === 'always' || l.mode === 'count')) return { mode: l.mode, count: clampNum(Math.round(l.count ?? 1), 1, 9999, 1) };
  return { mode: 'always', count: 1 };
}
function normalizeJump(j?: SceneJump): SceneJump {
  if (!j || (j.mode !== 'next' && j.mode !== 'prev' && j.mode !== 'scene')) return null;
  return j.mode === 'scene' ? { mode: 'scene', sceneId: j.sceneId } : { mode: j.mode };
}

export interface SceneOptions {
  id?: string;
  name?: string;
  values?: SceneValues;
  fadeIn?: number;
  fadeOut?: number;
  color?: string;
  type?: SceneType;
  steps?: ChaseStep[];
  rateMs?: number;
  level?: number;
  speed?: number;
  fadeSpeed?: number;
  phaseIn?: number;
  phaseOut?: number;
  driveMode?: SceneDriveMode;
  beatDiv?: number;
  startMode?: SceneStartMode;
  direction?: SceneDirection;
  layers?: FxLayer[];
  // ---- advanced playback ----
  priority?: ScenePriority;
  loop?: SceneLoop;
  jumpTo?: SceneJump;
  releaseAtEnd?: boolean;
  releaseMode?: ReleaseScope;
  releaseBanks?: string[];
  protectFromRelease?: ReleaseScope;
  protectBanks?: string[];
  flash?: boolean;
}

/** Minimal Universe shape this module reads from. */
interface SceneUniverse {
  id: number;
  data: Uint8Array;
  programmer: Uint8Array;
  /** per-channel engaged mask (set by manual LIVE writes) — read by `engagedOnly` */
  engaged?: Uint8Array;
}

/** Minimal Fixture shape used when restricting a snapshot to certain fixtures. */
interface SceneFixture {
  universeId: number;
  startAddress: number;
  channelCount: number;
}

export interface SnapshotOptions {
  id?: string;
  name?: string;
  universes: SceneUniverse[];
  from?: 'programmer' | 'data';
  fixtures?: SceneFixture[] | null;
  /** capture only channels flagged in each universe's `engaged` mask (manual
   *  LIVE writes) — even if their value is 0 — and nothing else. Used by the app
   *  so a Store saves exactly the faders you moved, not fixture defaults. */
  engagedOnly?: boolean;
}

/** Blend mode handled by the SceneMixer. */
export type SceneBlend = 'htp' | 'ltp';

export interface MixerTrackOptions {
  blend?: SceneBlend;
  opacity?: number;
}

/**
 * Runtime form of an FxLayer consumed by the SceneMixer. Mirrors FxLayer's
 * config but carries app-attached per-universe target addresses (in sweep
 * order). The engine stays fixture-agnostic — `targets` is filled by the app.
 */
export interface TrackLayer {
  id: string;
  kind: FxKind;
  enabled: boolean;
  rateMs: number;
  speed: number;
  driveMode: SceneDriveMode;
  beatDiv: number;
  direction: SceneDirection;
  size: number;
  spread: number;
  color?: ColorFxConfig;
  move?: MoveFxConfig;
  curve?: CurveFxConfig;
  chaser?: ChaserFxConfig;
  value?: ValueFxConfig;
  matrix?: MatrixFxConfig;
  /** per-universe target addresses in sweep order (attached by the app layer) */
  targets?: { [universeId: number]: number[][] };
  /** per-universe emitter world positions, index-aligned with `targets` (MATRIX FX) */
  positions?: { [universeId: number]: { x: number; y: number }[] };
  /** per-universe fixture id behind each target tuple, index-aligned with `targets`
   *  (attached by the app layer; lets the UI label each preview beam) */
  beamIds?: { [universeId: number]: string[] };
}

export interface MixerTrack {
  id: string;
  sceneId: string;
  opacity: number;
  blend: SceneBlend;
  values: Record<number, Uint8Array>;
  type?: SceneType;
  /** FX rack — effect layers composited over the base look (bottom→top) */
  layers?: TrackLayer[];
  /** chase: dense look per step, keyed by universe id */
  stepValues?: Record<number, Uint8Array>[];
  /** chase: per-step { fadeMs, waitMs } timing, parallel to stepValues */
  stepTimings?: { fadeMs: number; waitMs: number }[];
  rateMs?: number;
  /** SPEED knob — multiplier on the free-run period (chase base) */
  speed?: number;
  driveMode?: SceneDriveMode;
  beatDiv?: number;
  direction?: SceneDirection;
  /** blend priority tier (higher overrides lower on shared channels) */
  priority?: ScenePriority;
  /** stop after N loop cycles (0 = run forever) */
  loopCount?: number;
  [key: string]: unknown;
}

/**
 * Scene — snapshot of channel values across one or more universes, plus
 * fade timing metadata. Lives separately from the SceneMixer's runtime
 * tracks; convert with `scene.toMixerTrack()` before adding to the engine.
 *
 *   values:   { [universeId]: { [channel]: value } }   // sparse (1-based)
 *   fadeIn, fadeOut:  seconds
 */
export class Scene {
  id: string;
  name: string;
  values: SceneValues;
  fadeIn: number;
  fadeOut: number;
  color?: string;
  type: SceneType;
  /** chase: ordered steps — each a captured look with its own fade/wait timing */
  steps: ChaseStep[];
  /** chase step interval, ms */
  rateMs: number;
  /** DIMMER master — the opacity the scene fades toward when recalled (0..1) */
  level: number;
  /** SPEED knob — multiplier on the free-run period (0.25..4) */
  speed: number;
  /** multiplier on this scene's fade in/out times */
  fadeSpeed: number;
  /** pre-delay before the fade-in ramp begins, ms */
  phaseIn: number;
  /** pre-delay before the fade-out ramp begins, ms */
  phaseOut: number;
  /** tempo source — free-run (`rateMs`) or master-BPM sync */
  driveMode: SceneDriveMode;
  /** beat division when `driveMode === 'bpm'` (cycles per beat) */
  beatDiv: number;
  /** phase-clock behaviour on recall */
  startMode: SceneStartMode;
  /** playback direction */
  direction: SceneDirection;
  /** FX rack — ordered effect layers composited over the base look */
  layers: FxLayer[];
  /** blend priority tier (higher overrides lower on shared channels) */
  priority: ScenePriority;
  /** loop termination — forever, or stop after N cycles */
  loop: SceneLoop;
  /** action when a counted loop finishes (null = stop per `releaseAtEnd`) */
  jumpTo: SceneJump;
  /** at the end of a counted loop: release (true) or pause (false) */
  releaseAtEnd: boolean;
  /** which other scenes this recall releases */
  releaseMode: ReleaseScope;
  /** bank ids for `releaseMode === 'specific'` */
  releaseBanks: string[];
  /** which scopes can NOT release this scene */
  protectFromRelease: ReleaseScope;
  /** bank ids for `protectFromRelease === 'specific'` */
  protectBanks: string[];
  /** flash button — play while held, release on up */
  flash: boolean;

  constructor({
    id, name, values = {}, fadeIn = 0, fadeOut = 0, color,
    type = 'static', steps = [], rateMs = 500,
    level = 1, speed = 1, fadeSpeed = 1, phaseIn = 0, phaseOut = 0,
    driveMode = 'off', beatDiv = 1, startMode = 'restart', direction = 'forward',
    layers,
    priority = 'normal', loop, jumpTo = null, releaseAtEnd = true,
    releaseMode = 'bank', releaseBanks = [], protectFromRelease = 'off', protectBanks = [], flash = false,
  }: SceneOptions = {}) {
    this.id = id ?? `scene_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name ?? this.id;
    this.values = values;
    this.fadeIn = fadeIn;
    this.fadeOut = fadeOut;
    this.color = color;
    this.type = type;
    this.steps = steps;
    this.rateMs = rateMs;
    this.level = clamp01(level);
    this.speed = clampNum(speed, 0.05, 20, 1);
    this.fadeSpeed = clampNum(fadeSpeed, 0.1, 10, 1);
    this.phaseIn = Math.max(0, phaseIn || 0);
    this.phaseOut = Math.max(0, phaseOut || 0);
    this.driveMode = driveMode === 'bpm' ? 'bpm' : 'off';
    this.beatDiv = clampNum(beatDiv, 0.0625, 16, 1);
    this.startMode = startMode === 'continue' || startMode === 'random' ? startMode : 'restart';
    this.direction = direction === 'backward' || direction === 'bounce' ? direction : 'forward';
    this.layers = (layers ?? []).map(normalizeLayer);
    this.priority = PRIORITIES.includes(priority) ? priority : 'normal';
    this.loop = normalizeLoop(loop);
    this.jumpTo = normalizeJump(jumpTo);
    this.releaseAtEnd = releaseAtEnd !== false;
    this.releaseMode = SCOPES.includes(releaseMode) ? releaseMode : 'bank';
    this.releaseBanks = strArr(releaseBanks);
    this.protectFromRelease = SCOPES.includes(protectFromRelease) ? protectFromRelease : 'off';
    this.protectBanks = strArr(protectBanks);
    this.flash = !!flash;
  }

  setValue(universeId: number, channel: number, value: number): void {
    (this.values[universeId] ??= {})[channel] = value & 0xff;
  }

  // ---- FX rack -----------------------------------------------------------
  getLayer(id: string): FxLayer | undefined { return this.layers.find((l) => l.id === id); }

  /** Append a fresh layer of `kind` with sensible defaults; returns it. */
  addLayer(kind: FxKind): FxLayer {
    const layer = defaultFxLayer(kind);
    this.layers.push(layer);
    return layer;
  }

  removeLayer(id: string): void {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i >= 0) this.layers.splice(i, 1);
  }

  /** Move a layer by ±1 (clamped). Returns the new index, or -1 if not found. */
  moveLayer(id: string, delta: number): number {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return -1;
    const to = Math.max(0, Math.min(this.layers.length - 1, i + (delta < 0 ? -1 : 1)));
    if (to === i) return i;
    const [l] = this.layers.splice(i, 1);
    this.layers.splice(to, 0, l);
    return to;
  }

  /**
   * Capture current state of one or more universes (reads `programmer`
   * buffer by default — pass `from: 'data'` for post-mix output).
   *
   *   const s = Scene.snapshot({ id, name, universes: [u0, u1] });
   *
   * Optionally restrict to channels owned by a list of fixtures —
   * useful when you only want a colour scene, not whatever else is
   * patched on those universes.
   */
  static snapshot({ id, name, universes, from = 'programmer', fixtures = null, engagedOnly = false }: SnapshotOptions): Scene {
    const sc = new Scene({ id, name });
    const allow = fixtures ? perUniverseAddrs(fixtures) : null;
    for (const u of universes) {
      const buf = from === 'data' ? u.data : u.programmer;
      const allowed = allow?.get(u.id);
      const engaged = engagedOnly ? u.engaged : null;
      for (let i = 0; i < buf.length; i++) {
        if (allowed && !allowed.has(i + 1)) continue;
        // engagedOnly: capture exactly the manually-engaged channels (even 0).
        // Otherwise capture every non-zero channel.
        if (engaged ? engaged[i] : buf[i] !== 0) sc.setValue(u.id, i + 1, buf[i]);
      }
    }
    return sc;
  }

  /**
   * Build a dense SceneMixer track from sparse values. Carries the playback
   * type + step/FX data; the engine animates it per tick. `colorTargets` /
   * `moveTargets` (FX channel addresses) are attached by the app layer, which
   * has the patch — the engine itself stays fixture-agnostic.
   *
   *   engine.scenes.addTrack(scene.toMixerTrack({ blend: 'ltp' }));
   */
  toMixerTrack({ blend = 'htp', opacity = 0 }: MixerTrackOptions = {}): MixerTrack {
    const track: MixerTrack = {
      id: this.id, sceneId: this.id, opacity, blend,
      values: densify(this.values), type: this.type,
      priority: this.priority,
      loopCount: this.loop.mode === 'count' ? this.loop.count : 0,
    };
    if (this.type === 'chase') {
      track.stepValues = this.steps.map((s) => densify(s.values));
      track.stepTimings = this.steps.map((s) => ({ fadeMs: s.fadeMs, waitMs: s.waitMs }));
      track.rateMs = this.rateMs;
      track.speed = this.speed;
      track.driveMode = this.driveMode;
      track.beatDiv = this.beatDiv;
      track.direction = this.direction;
    }
    if (this.layers.length) track.layers = this.layers.map(toTrackLayer);
    return track;
  }
}

/** FxLayer → TrackLayer (config copied; `targets` attached later by the app). */
function toTrackLayer(l: FxLayer): TrackLayer {
  return {
    id: l.id, kind: l.kind, enabled: l.enabled,
    rateMs: l.rateMs, speed: l.speed, driveMode: l.driveMode, beatDiv: l.beatDiv,
    direction: l.direction, size: l.size, spread: l.spread,
    color: l.color ? { ...l.color, palette: [...l.color.palette] } : undefined,
    move: l.move ? { ...l.move } : undefined,
    curve: l.curve ? { ...l.curve } : undefined,
    chaser: l.chaser ? { ...l.chaser } : undefined,
    value: l.value ? { ...l.value } : undefined,
    matrix: l.matrix ? { ...l.matrix, palette: [...l.matrix.palette] } : undefined,
  };
}

const clamp01 = (n: number): number => (n <= 0 ? 0 : n >= 1 ? 1 : n);
function clampNum(n: number, lo: number, hi: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

/** Sparse SceneValues → dense per-universe channel buffers (real DMX + virtual). */
function densify(values: SceneValues): Record<number, Uint8Array> {
  const dense: Record<number, Uint8Array> = {};
  for (const [uniId, channels] of Object.entries(values)) {
    const buf = new Uint8Array(TOTAL_CHANNELS);
    for (const [ch, v] of Object.entries(channels)) buf[(+ch) - 1] = v & 0xff;
    dense[+uniId] = buf;
  }
  return dense;
}

function perUniverseAddrs(fixtures: SceneFixture[]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const f of fixtures) {
    let s = map.get(f.universeId);
    if (!s) { s = new Set(); map.set(f.universeId, s); }
    for (let i = 0; i < f.channelCount; i++) s.add(f.startAddress + i);
  }
  return map;
}

// ---- chase steps -------------------------------------------------------

/** Default dwell for a freshly captured chase step (ms). */
export const DEFAULT_STEP_WAIT = 500;

/** Build a chase step from a captured look. */
export function chaseStep(values: SceneValues, waitMs = DEFAULT_STEP_WAIT, fadeMs = 0): ChaseStep {
  return { values, waitMs: Math.max(0, waitMs), fadeMs: Math.max(0, fadeMs) };
}

/**
 * Coerce a persisted/loose step into a ChaseStep. Back-compat: pre-timing
 * projects stored steps as bare `SceneValues`; those are wrapped with the given
 * default dwell and no fade so old shows keep their uniform chase behaviour.
 */
export function toChaseStep(raw: unknown, defaultWaitMs = DEFAULT_STEP_WAIT): ChaseStep {
  if (raw && typeof raw === 'object' && 'values' in (raw as object)) {
    const s = raw as { values: SceneValues; waitMs?: number; fadeMs?: number };
    return chaseStep(s.values ?? {}, s.waitMs ?? defaultWaitMs, s.fadeMs ?? 0);
  }
  return chaseStep((raw as SceneValues) ?? {}, defaultWaitMs, 0);
}

// ---- FX layers ---------------------------------------------------------

let layerSeq = 0;
function layerId(): string {
  return `fx_${(layerSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A fresh layer of `kind`, populated with that kind's default config. */
export function defaultFxLayer(kind: FxKind): FxLayer {
  const l: FxLayer = {
    id: layerId(), kind, enabled: true,
    target: { mode: 'all' }, order: 'patch',
    rateMs: 4000, speed: 1, driveMode: 'off', beatDiv: 1, direction: 'forward',
    size: 96, spread: 30,
  };
  if (kind === 'color') l.color = { ...DEFAULT_COLOR_FX, palette: [] };
  else if (kind === 'move') l.move = { ...DEFAULT_MOVE_FX };
  else if (kind === 'curve') l.curve = { ...DEFAULT_CURVE_FX };
  else if (kind === 'chaser') l.chaser = { ...DEFAULT_CHASER_FX };
  else if (kind === 'value') l.value = { ...DEFAULT_VALUE_FX };
  else if (kind === 'matrix') l.matrix = { ...DEFAULT_MATRIX_FX, palette: [] };
  return l;
}

/** Coerce a persisted/loose layer into a well-formed FxLayer (fills defaults). */
export function normalizeLayer(raw: Partial<FxLayer> & { kind: FxKind }): FxLayer {
  const l = defaultFxLayer(raw.kind);
  if (raw.id) l.id = raw.id;
  if (typeof raw.enabled === 'boolean') l.enabled = raw.enabled;
  if (raw.target && (raw.target.mode === 'all' || raw.target.mode === 'group' || raw.target.mode === 'selection')) l.target = raw.target;
  if (raw.order) l.order = raw.order;
  if (raw.rateMs != null) l.rateMs = raw.rateMs;
  if (raw.speed != null) l.speed = raw.speed;
  if (raw.driveMode) l.driveMode = raw.driveMode;
  if (raw.beatDiv != null) l.beatDiv = raw.beatDiv;
  if (raw.direction) l.direction = raw.direction;
  if (raw.size != null) l.size = raw.size;
  if (raw.spread != null) l.spread = raw.spread;
  if (raw.kind === 'color' && raw.color) l.color = { ...DEFAULT_COLOR_FX, ...raw.color, palette: [...(raw.color.palette ?? [])] };
  else if (raw.kind === 'move' && raw.move) l.move = { ...DEFAULT_MOVE_FX, ...raw.move };
  else if (raw.kind === 'curve' && raw.curve) l.curve = { ...DEFAULT_CURVE_FX, ...raw.curve };
  else if (raw.kind === 'chaser' && raw.chaser) l.chaser = { ...DEFAULT_CHASER_FX, ...raw.chaser };
  else if (raw.kind === 'value' && raw.value) l.value = { ...DEFAULT_VALUE_FX, ...raw.value };
  else if (raw.kind === 'matrix' && raw.matrix) l.matrix = { ...DEFAULT_MATRIX_FX, ...raw.matrix, palette: [...(raw.matrix.palette ?? [])] };
  return l;
}
