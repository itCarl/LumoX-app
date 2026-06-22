import { MixModule } from '../MixModule';
import type { MixModuleConfig, MixContext } from '../MixModule';
import { TOTAL_CHANNELS } from '../../core/Universe';
import type { Universe } from '../../core/Universe';
import { renderColorFx, renderMoveFx, renderWaveFx, renderChaserFx, renderMatrixFx } from '../sceneFx';
import type { TrackLayer } from '../../show/Scene';

export type BlendMode = 'htp' | 'ltp';
export type SceneTrackType = 'static' | 'chase';
export type SceneDriveMode = 'off' | 'bpm';
export type SceneDirection = 'forward' | 'backward' | 'bounce';

/**
 * A single scene track consumed by the SceneMixer.
 */
export interface SceneTrack {
  id: string;
  sceneId?: string;
  /** current blended weight, 0..1 */
  opacity: number;
  /** default 'htp' */
  blend: BlendMode;
  /** pre-rendered scene data keyed by universe id (the base look) */
  values: { [universeId: number]: Uint8Array };
  /** playback type — default 'static' (a fixed look) */
  type?: SceneTrackType;
  /** chase: dense look per step, keyed by universe id */
  stepValues?: { [universeId: number]: Uint8Array }[];
  /** chase: per-step { fadeMs, waitMs } timing, parallel to stepValues */
  stepTimings?: { fadeMs: number; waitMs: number }[];
  /** chase step interval, ms */
  rateMs?: number;
  /** multiplier on the free-run period (SPEED knob, chase base) */
  speed?: number;
  /** tempo source — free-run or synced to the mixer's master BPM */
  driveMode?: SceneDriveMode;
  /** beat division when `driveMode === 'bpm'` (cycles per beat) */
  beatDiv?: number;
  /** playback direction */
  direction?: SceneDirection;
  /** FX rack — effect layers composited over the base look (bottom→top) */
  layers?: TrackLayer[];
  /** blend priority tier — higher overrides lower on shared channels */
  priority?: ScenePriority;
  /** stop after N loop cycles (0 = run forever) */
  loopCount?: number;
  [key: string]: unknown;
}

export type ScenePriority = 'low' | 'normal' | 'high';
/** Tier rank for priority blending (high wins). */
function priorityRank(p?: ScenePriority): number { return p === 'high' ? 2 : p === 'low' ? 0 : 1; }

/**
 * Per-track runtime playback state. Created lazily when a track is faded or
 * driven by transport; advanced ONLY in `update(deltaMs)` (once per tick) so
 * the per-universe `process()` can stay a pure reader.
 */
interface ScenePlayback {
  // opacity ramp
  fading: boolean;
  fadeFrom: number;
  fadeTarget: number;
  fadeTotalMs: number;
  fadeElapsedMs: number;
  preDelayMs: number;
  // phase clock (ms of virtual time the animation has run) — base look (chase)
  phaseMs: number;
  /** per-layer phase clocks, keyed by layer id (FX rack) */
  layerPhaseMs: Record<string, number>;
  paused: boolean;
  /** chase: pinned step index (transport); null = follow the clock */
  manualStep: number | null;
  /** ms of live playback since the last recall — drives the loop counter */
  runMs: number;
  /** the counted loop has reached its target (don't re-signal completion) */
  loopDone: boolean;
}

/**
 * A dipless scene-to-scene crossfade. Unlike the opacity ramp (which HTP-blends
 * two partially-faded looks and so dips on shared channels), a transition mixes
 * ONE value-wise interpolated source — `lerp(from, to·level, f)` — into the
 * normal priority/HTP stack. `from` is the frozen combined look of the outgoing
 * (`fromIds`) tracks, captured lazily per universe at the first `process` after
 * the start; `to` is the incoming (`toId`) track's live, animating frame. The
 * outgoing tracks are SUPPRESSED from the normal blend for the duration (they are
 * represented by the snapshot), then removed when the fade completes. Coexisting
 * scenes outside `fromIds`/`toId` blend independently, so other banks keep running.
 */
interface Transition {
  toId: string;
  /** the incoming scene's DIMMER level the crossfade targets (0..1) */
  level: number;
  fromIds: string[];
  /** captured outgoing look per universe id (frozen at start) */
  from: Record<number, Uint8Array>;
  /** universe ids whose `from` snapshot has been taken */
  captured: Set<number>;
  elapsedMs: number;
  totalMs: number;
  /** pre-delay before the crossfade ramp begins (holds the outgoing look) */
  preDelayMs: number;
}

const clamp01 = (n: number): number => (n <= 0 ? 0 : n >= 1 ? 1 : n);

/** Step index for a clock position, honouring playback direction. */
function stepIndex(clockMs: number, periodMs: number, n: number, dir: SceneDirection): number {
  if (n <= 1) return 0;
  const raw = Math.floor(clockMs / Math.max(1, periodMs));
  if (dir === 'backward') return (((-raw) % n) + n) % n;
  if (dir === 'bounce') {
    const m = 2 * n - 2;                  // ping-pong cycle length
    const p = ((raw % m) + m) % m;
    return p < n ? p : m - p;
  }
  return ((raw % n) + n) % n;
}

// Play orders depend only on (n, dir), so memoize them — they are rebuilt every
// tick on the chase hot path. Cached arrays are shared; callers must not mutate.
const chaseSeqCache = new Map<string, number[]>();

/** Play order of step indices for a direction (bounce ping-pongs the interior). */
function chaseSeq(n: number, dir: SceneDirection): number[] {
  const key = `${n}|${dir}`;
  const cached = chaseSeqCache.get(key);
  if (cached) return cached;
  const seq = buildChaseSeq(n, dir);
  chaseSeqCache.set(key, seq);
  return seq;
}

function buildChaseSeq(n: number, dir: SceneDirection): number[] {
  if (n <= 1) return [0];
  if (dir === 'backward') return Array.from({ length: n }, (_, i) => n - 1 - i);
  if (dir === 'bounce') {
    const seq = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 2; i >= 1; i--) seq.push(i);   // n-2 … 1 (endpoints not repeated)
    return seq;
  }
  return Array.from({ length: n }, (_, i) => i);
}

/** Linear per-channel crossfade a→b by f (0..1) into `out`; null when both empty. */
function crossfadeInto(
  out: Uint8Array, a: Uint8Array | undefined, b: Uint8Array | undefined, f: number,
): Uint8Array | null {
  if (!a && !b) return null;
  for (let i = 0; i < out.length; i++) {
    const va = a ? a[i] : 0;
    const vb = b ? b[i] : 0;
    out[i] = (va + (vb - va) * f) & 0xff;
  }
  return out;
}

/** Effective clock fed to the FX renderers, honouring playback direction. */
function effectiveNow(clockMs: number, periodMs: number, dir: SceneDirection): number {
  if (dir === 'backward') return -clockMs;
  if (dir === 'bounce') {
    const twoP = 2 * Math.max(1, periodMs);
    const t = ((clockMs % twoP) + twoP) % twoP;
    return t <= periodMs ? t : twoP - t;   // triangle wave: out then back
  }
  return clockMs;
}

/**
 * SceneMixer — blends a list of active "scene tracks" into the frame.
 *
 * Two clocks:
 *   - `process(universe, ctx)` runs per universe per tick and only READS
 *     `opacity` + the track's playback phase. It never mutates time-state.
 *   - `update(deltaMs)` runs ONCE per tick (driven by the engine 'tick' event)
 *     and is the sole writer of fade ramps and phase clocks.
 *
 * Static tracks ignore the phase clock (a fixed look). Dynamic tracks
 * (chase / colorfx / movefx) animate from their per-track `phaseMs`, falling
 * back to `ctx.now` when no playback state exists (so direct/headless use of
 * the mixer animates without anyone calling `update`).
 */
export class SceneMixer extends MixModule {
  tracks: Map<string, SceneTrack>;
  playback: Map<string, ScenePlayback>;
  /** active dipless crossfades, keyed by the incoming (`toId`) track id */
  transitions: Map<string, Transition>;
  /** master tempo (BPM) used by tracks with `driveMode === 'bpm'` */
  bpm: number;
  /** composed layer output / single-FX frame (returned to the blend) */
  _scratch: Uint8Array;
  /** base look for a chase under an FX rack — kept separate so the chase
   *  crossfade doesn't alias `_scratch` while layers composite on top */
  _baseScratch: Uint8Array;
  /** lerp output for a transition source (kept apart from `_scratch`, which the
   *  incoming track's `_frame` writes to while a transition composites) */
  private _transScratch: Uint8Array;
  /** channels owned by a higher priority tier this process() pass (mask) */
  private _claimed: Uint8Array;
  /** channels a tier wrote this pass, merged into `_claimed` after the tier */
  private _touched: Uint8Array;
  /** outgoing track ids suppressed by an active transition (rebuilt per process) */
  private _suppressed: Set<string>;
  /** incoming track id → its transition (rebuilt per process) */
  private _targetOf: Map<string, Transition>;
  /** ids whose fade-out just settled to 0 — drained by `consumeWentInactive()` */
  private _wentInactive: Set<string>;
  /** ids whose counted loop just finished — drained by `consumeCompleted()` */
  private _completed: Set<string>;

  constructor(config: MixModuleConfig = {}) {
    super({ name: 'Scene Mixer', ...config });
    this.tracks = new Map(); // trackId → track
    this.playback = new Map();
    this.transitions = new Map();
    this.bpm = 120;
    this._scratch = new Uint8Array(TOTAL_CHANNELS);
    this._baseScratch = new Uint8Array(TOTAL_CHANNELS);
    this._transScratch = new Uint8Array(TOTAL_CHANNELS);
    this._claimed = new Uint8Array(TOTAL_CHANNELS);
    this._touched = new Uint8Array(TOTAL_CHANNELS);
    this._suppressed = new Set();
    this._targetOf = new Map();
    this._wentInactive = new Set();
    this._completed = new Set();
  }

  addTrack(track: Partial<SceneTrack> & { id: string }): void {
    this.tracks.set(track.id, {
      blend: 'htp', opacity: 1, values: {}, ...track,
    } as SceneTrack);
  }

  removeTrack(id: string): void {
    this.tracks.delete(id);
    this.playback.delete(id);
    this._wentInactive.delete(id);
    this._completed.delete(id);
    // drop any transition this id is the target of; detach it as an outgoing source
    this.transitions.delete(id);
    for (const tr of this.transitions.values()) {
      const i = tr.fromIds.indexOf(id);
      if (i >= 0) tr.fromIds.splice(i, 1);
    }
  }

  setOpacity(trackId: string, opacity: number): void {
    const t = this.tracks.get(trackId);
    if (t) t.opacity = clamp01(opacity);
  }

  clear(): void {
    this.tracks.clear();
    this.playback.clear();
    this.transitions.clear();
    this._wentInactive.clear();
    this._completed.clear();
  }

  setBpm(bpm: number): void {
    if (Number.isFinite(bpm)) this.bpm = Math.max(20, Math.min(300, bpm));
  }

  /** Free-run / beat-synced cycle period for a track, in ms. */
  effectivePeriod(t: SceneTrack): number {
    if (t.driveMode === 'bpm') {
      const beat = 60000 / Math.max(1, this.bpm);
      return Math.max(1, beat / Math.max(0.0001, t.beatDiv ?? 1));
    }
    return Math.max(1, (t.rateMs ?? 500) / Math.max(0.01, t.speed ?? 1));
  }

  /** Free-run / beat-synced cycle period for a single FX layer, in ms. */
  layerPeriod(L: TrackLayer): number {
    if (L.driveMode === 'bpm') {
      const beat = 60000 / Math.max(1, this.bpm);
      return Math.max(1, beat / Math.max(0.0001, L.beatDiv ?? 1));
    }
    return Math.max(1, (L.rateMs ?? 4000) / Math.max(0.01, L.speed ?? 1));
  }

  // ---- fades -------------------------------------------------------------

  /**
   * Ramp a track's opacity toward `target` over `seconds`, after an optional
   * `preDelayMs`. `seconds <= 0` with no pre-delay settles instantly — this
   * preserves the original instant-recall behaviour for scenes with no fade.
   */
  fadeTo(id: string, target: number, seconds: number, preDelayMs = 0): void {
    const track = this.tracks.get(id);
    if (!track) return;
    // A manual fade on a scene that is a live crossfade target overrides the
    // crossfade: settle it first (its outgoing go to 0) and ramp from here.
    if (this.transitions.has(id)) this._finalizeTransition(id);
    const pb = this._ensurePlayback(id);
    const ms = Math.max(0, (seconds || 0) * 1000);
    const delay = Math.max(0, preDelayMs || 0);
    const tgt = clamp01(target);
    if (ms <= 0 && delay <= 0) {
      track.opacity = tgt;
      pb.fading = false;
      pb.fadeTotalMs = 0;
      pb.preDelayMs = 0;
      if (tgt <= 0) this._wentInactive.add(id);
      return;
    }
    pb.fadeFrom = track.opacity;
    pb.fadeTarget = tgt;
    pb.fadeTotalMs = ms;
    pb.fadeElapsedMs = 0;
    pb.preDelayMs = delay;
    pb.fading = true;
  }

  /**
   * Start a dipless crossfade from a set of outgoing tracks to one incoming
   * track over `totalMs` (after an optional `preDelayMs`). The incoming track is
   * set live at `level` immediately and the outgoing tracks are held + suppressed
   * (represented by a frozen snapshot) until the fade completes, then dropped to
   * opacity 0 (the tracks PERSIST — every scene keeps its track so it can be
   * recalled again). Use this for recall-with-release; a plain fade-in/out keeps
   * {@link fadeTo}.
   */
  startTransition(opts: { toId: string; level: number; fromIds: string[]; totalMs: number; preDelayMs?: number }): void {
    const target = this.tracks.get(opts.toId);
    if (!target) return;
    const level = clamp01(opts.level);
    // An outgoing scene that is itself mid-crossfade-in: settle that crossfade
    // first (zero ITS outgoing), so we snapshot the scene's own look.
    for (const fid of opts.fromIds) {
      if (this.transitions.has(fid)) this._finalizeTransition(fid);
    }
    // Re-recalling the same target replaces any in-flight crossfade into it.
    this.transitions.delete(opts.toId);
    const fromIds = opts.fromIds.filter((id) => id !== opts.toId && this.tracks.has(id));
    // Hold each outgoing track at full while it is represented by the snapshot;
    // cancel any opacity ramp it had so `update()` doesn't fight the crossfade.
    for (const fid of fromIds) {
      const t = this.tracks.get(fid);
      if (t) t.opacity = 1;
      const pb = this.playback.get(fid);
      if (pb) pb.fading = false;
    }
    target.opacity = level;
    const pb = this.playback.get(opts.toId);
    if (pb) pb.fading = false;   // the crossfade owns the incoming level now
    this.transitions.set(opts.toId, {
      toId: opts.toId, level, fromIds,
      from: {}, captured: new Set(),
      elapsedMs: 0, totalMs: Math.max(0, opts.totalMs || 0), preDelayMs: Math.max(0, opts.preDelayMs || 0),
    });
  }

  /**
   * Finish a transition now: drop its outgoing tracks to opacity 0 (signalling
   * inactivity for broadcast gating) WITHOUT removing them — scene tracks are
   * permanent so every scene stays recallable. The incoming track keeps its level.
   */
  private _finalizeTransition(toId: string): void {
    const tr = this.transitions.get(toId);
    if (!tr) return;
    for (const fid of tr.fromIds) {
      const t = this.tracks.get(fid);
      if (t) {
        t.opacity = 0;
        const pb = this.playback.get(fid);
        if (pb) pb.fading = false;
        this._wentInactive.add(fid);
      }
    }
    this.transitions.delete(toId);
  }

  /** True while a track is visible or fading toward a visible target. */
  isLive(id: string): boolean {
    const t = this.tracks.get(id);
    if (!t) return false;
    if (t.opacity > 0) return true;
    const pb = this.playback.get(id);
    return !!pb && pb.fading && pb.fadeTarget > 0;
  }

  /** Drain the set of tracks whose fade-out just reached 0 this update. */
  consumeWentInactive(): string[] {
    if (!this._wentInactive.size) return [];
    const ids = [...this._wentInactive];
    this._wentInactive.clear();
    return ids;
  }

  // ---- transport / phase clock ------------------------------------------

  /**
   * Seed the phase clock for a recall, per the scene's start mode:
   *   restart  → 0
   *   continue → keep the free-running clock
   *   random   → a random offset (looks different each recall)
   * Always un-pauses and clears any pinned manual step.
   */
  resetPhase(id: string, mode: 'restart' | 'continue' | 'random'): void {
    const pb = this._ensurePlayback(id);
    pb.paused = false;
    pb.manualStep = null;
    // The loop counter always restarts on recall — it counts cycles played
    // since this recall, independent of whether the phase clock is reseeded.
    pb.runMs = 0;
    pb.loopDone = false;
    this._completed.delete(id);
    if (mode === 'restart') { pb.phaseMs = 0; pb.layerPhaseMs = {}; }
    else if (mode === 'random') { pb.phaseMs = Math.random() * 1e6; pb.layerPhaseMs = {}; }
  }

  /** Drain the set of tracks whose counted loop just finished this update. */
  consumeCompleted(): string[] {
    if (!this._completed.size) return [];
    const ids = [...this._completed];
    this._completed.clear();
    return ids;
  }

  setPaused(id: string, paused: boolean): void {
    const pb = this._ensurePlayback(id);
    pb.paused = paused;
    if (!paused) pb.manualStep = null;   // resume hands control back to the clock
  }

  pause(id: string): void { this.setPaused(id, true); }
  resume(id: string): void { this.setPaused(id, false); }

  stepNext(id: string): void { this._step(id, +1); }
  stepPrev(id: string): void { this._step(id, -1); }

  toStart(id: string): void {
    const t = this.tracks.get(id); if (!t) return;
    const pb = this._ensurePlayback(id);
    pb.paused = true;
    pb.phaseMs = 0;
    pb.manualStep = t.type === 'chase' ? 0 : null;
  }

  toEnd(id: string): void {
    const t = this.tracks.get(id); if (!t) return;
    const pb = this._ensurePlayback(id);
    pb.paused = true;
    const n = t.stepValues?.length ?? 0;
    pb.manualStep = t.type === 'chase' && n > 0 ? n - 1 : null;
  }

  paused(id: string): boolean { return this.playback.get(id)?.paused ?? false; }

  /**
   * Live phase of one FX-rack layer, for UI playhead sync. Returns the raw
   * phase clock (the same `now` fed to the FX renderers, before `effectiveNow`),
   * the layer's current period, and the paused flag — or null when the scene is
   * not live (no visible output to track; the UI free-runs its own preview).
   */
  layerPhaseInfo(sceneId: string, layerId: string): { phaseMs: number; periodMs: number; paused: boolean } | null {
    if (!this.isLive(sceneId)) return null;
    const pb = this.playback.get(sceneId);
    const track = this.tracks.get(sceneId);
    const L = track?.layers?.find((x) => x.id === layerId);
    if (!pb || !L) return null;
    return { phaseMs: pb.layerPhaseMs[layerId] ?? 0, periodMs: this.layerPeriod(L), paused: pb.paused };
  }

  /** Live timeline of a scene's primary motion for the UI playhead: the visible
   *  cycle length + the current phase position, taken from whatever actually
   *  drives the animation. A chase uses its base clock; an FX scene uses the
   *  FIRST ENABLED LAYER's own clock + period (the base `phaseMs` does NOT advance
   *  for a static+FX scene — only layer clocks do). Bounce doubles the cycle for
   *  the out-and-back. {cycleMs:0} for a non-periodic static look. */
  sceneTimeline(sceneId: string): { cycleMs: number; phaseMs: number } {
    const t = this.tracks.get(sceneId);
    if (!t) return { cycleMs: 0, phaseMs: 0 };
    const pb = this.playback.get(sceneId);
    if (t.type === 'chase') return { cycleMs: this.sceneCycleMs(t), phaseMs: pb?.phaseMs ?? 0 };
    const L = t.layers?.find((x) => x.enabled);
    if (!L) return { cycleMs: 0, phaseMs: 0 };
    const period = this.layerPeriod(L);
    return { cycleMs: L.direction === 'bounce' ? period * 2 : period, phaseMs: pb?.layerPhaseMs?.[L.id] ?? 0 };
  }

  /** Active step index for the current clock, under the track's timing model. */
  private _currentStep(t: SceneTrack, clock: number): number {
    const n = t.stepValues?.length ?? 0;
    if (n <= 0) return 0;
    const dir = t.direction ?? 'forward';
    const timings = t.stepTimings;
    if (t.driveMode === 'bpm' || !timings) return stepIndex(clock, this.effectivePeriod(t), n, dir);
    const seq = chaseSeq(n, dir);
    let cycle = 0;
    for (const si of seq) cycle += Math.max(0, timings[si]?.fadeMs ?? 0) + Math.max(0, timings[si]?.waitMs ?? 0);
    if (cycle <= 0) return seq[0];
    let tt = (((clock * (t.speed ?? 1)) % cycle) + cycle) % cycle;
    for (const si of seq) {
      const seg = Math.max(0, timings[si]?.fadeMs ?? 0) + Math.max(0, timings[si]?.waitMs ?? 0);
      if (tt < seg) return si;
      tt -= seg;
    }
    return seq[seq.length - 1];
  }

  private _step(id: string, delta: number): void {
    const t = this.tracks.get(id); if (!t) return;
    const pb = this._ensurePlayback(id);
    pb.paused = true;
    if (t.type === 'chase') {
      const n = t.stepValues?.length ?? 0;
      if (n <= 0) return;
      const cur = pb.manualStep ?? this._currentStep(t, pb.phaseMs);
      pb.manualStep = (((cur + delta) % n) + n) % n;
    } else {
      // FX have no discrete steps — nudge the phase by an eighth of a cycle
      pb.phaseMs += delta * this.effectivePeriod(t) * 0.125;
    }
  }

  private _ensurePlayback(id: string): ScenePlayback {
    let pb = this.playback.get(id);
    if (!pb) {
      pb = {
        fading: false, fadeFrom: 0, fadeTarget: 0, fadeTotalMs: 0, fadeElapsedMs: 0,
        preDelayMs: 0, phaseMs: 0, layerPhaseMs: {}, paused: false, manualStep: null,
        runMs: 0, loopDone: false,
      };
      this.playback.set(id, pb);
    }
    return pb;
  }

  /**
   * Real-time length of one playback cycle (ms) for loop counting. A chase walks
   * its step list (timed fade+wait, or n×period when BPM-synced); an FX rack with
   * no chase base uses its first enabled layer's period. Returns 0 when there is
   * nothing periodic to count (a plain static look), so its loop never completes.
   */
  private sceneCycleMs(t: SceneTrack): number {
    if (t.type === 'chase') {
      const n = t.stepValues?.length ?? 0;
      if (n <= 1) return 0;
      const dir = t.direction ?? 'forward';
      const timings = t.stepTimings;
      if (t.driveMode === 'bpm' || !timings) {
        const steps = dir === 'bounce' ? 2 * n - 2 : n;
        return steps * this.effectivePeriod(t);
      }
      let cycle = 0;
      for (const si of chaseSeq(n, dir)) cycle += Math.max(0, timings[si]?.fadeMs ?? 0) + Math.max(0, timings[si]?.waitMs ?? 0);
      return cycle / Math.max(0.01, t.speed ?? 1);
    }
    const L = t.layers?.find((x) => x.enabled);
    return L ? this.layerPeriod(L) : 0;
  }

  // ---- per-tick state advance (sole writer of fades + phase clocks) ------

  update(deltaMs: number): void {
    for (const [id, pb] of this.playback) {
      const track = this.tracks.get(id);
      if (!track) { this.playback.delete(id); continue; }

      if (pb.fading) {
        if (pb.preDelayMs > 0) {
          pb.preDelayMs -= deltaMs;
        } else {
          pb.fadeElapsedMs += deltaMs;
          if (pb.fadeTotalMs <= 0 || pb.fadeElapsedMs >= pb.fadeTotalMs) {
            track.opacity = pb.fadeTarget;
            pb.fading = false;
            if (track.opacity <= 0) this._wentInactive.add(id);
          } else {
            const f = pb.fadeElapsedMs / pb.fadeTotalMs;
            track.opacity = clamp01(pb.fadeFrom + (pb.fadeTarget - pb.fadeFrom) * f);
          }
        }
      }

      // advance the base phase clock for a running dynamic base (chase)
      if (!pb.paused && pb.manualStep == null && isDynamic(track.type)) {
        pb.phaseMs += deltaMs;
      }
      // advance each enabled FX-rack layer's own clock
      if (!pb.paused && track.layers && track.layers.length) {
        for (const L of track.layers) {
          if (L.enabled) pb.layerPhaseMs[L.id] = (pb.layerPhaseMs[L.id] ?? 0) + deltaMs;
        }
      }

      // loop counter — accumulate live play time and signal once the scene has
      // run its target number of cycles (only while visible, so idle free-run
      // doesn't tick it; only when a finite loopCount is set).
      const live = track.opacity > 0 || (pb.fading && pb.fadeTarget > 0);
      if (live && !pb.paused && !pb.loopDone && (track.loopCount ?? 0) > 0) {
        pb.runMs += deltaMs;
        const cyc = this.sceneCycleMs(track);
        if (cyc > 0 && pb.runMs >= cyc * (track.loopCount as number)) {
          pb.loopDone = true;
          this._completed.add(id);
        }
      }
    }

    // advance dipless crossfades; when one completes, drop its outgoing tracks
    // (the incoming track stays live at its level and blends normally after).
    for (const [toId, tr] of this.transitions) {
      if (tr.preDelayMs > 0) { tr.preDelayMs -= deltaMs; continue; }
      tr.elapsedMs += deltaMs;
      if (tr.elapsedMs >= tr.totalMs) this._finalizeTransition(toId);
    }
  }

  process(universe: Universe, ctx: MixContext): void {
    // Composite by priority tier, high → low. A higher tier "claims" the channels
    // it writes; lower tiers can't touch claimed channels, so a high-priority
    // scene overrides lower ones on shared fixtures. Within a tier, tracks blend
    // as usual (HTP/LTP by opacity). With all scenes at the default 'normal' tier
    // only one pass runs with nothing claimed — identical to a flat blend.
    const claimed = this._claimed;
    const touched = this._touched;
    claimed.fill(0);

    // Resolve active crossfades: which tracks are suppressed outgoing sources,
    // which are incoming targets, and freeze each outgoing look once per universe.
    const suppressed = this._suppressed;
    const targetOf = this._targetOf;
    suppressed.clear();
    targetOf.clear();
    if (this.transitions.size) {
      const uid = universe.id;
      for (const tr of this.transitions.values()) {
        targetOf.set(tr.toId, tr);
        for (const fid of tr.fromIds) suppressed.add(fid);
        if (!tr.captured.has(uid)) {
          const snap = new Uint8Array(TOTAL_CHANNELS);
          this._combineLook(tr.fromIds, universe, ctx, snap);
          tr.from[uid] = snap;
          tr.captured.add(uid);
        }
      }
    }

    for (let tier = 2; tier >= 0; tier--) {
      touched.fill(0);
      let wrote = false;
      for (const t of this.tracks.values()) {
        if (t.opacity <= 0 || priorityRank(t.priority) !== tier) continue;
        if (suppressed.has(t.id)) continue;   // represented by a transition snapshot
        const tr = targetOf.get(t.id);
        const src = tr ? this._transitionFrame(tr, t, universe, ctx) : this._frame(t, universe, ctx);
        if (!src) continue;
        // a transition source already bakes the incoming level into the lerp.
        const op = tr ? 1 : t.opacity;
        if (t.blend === 'ltp') blendMaskedLTP(universe.data, src, op, claimed, touched);
        else                   blendMaskedHTP(universe.data, src, op, claimed, touched);
        wrote = true;
      }
      if (wrote) for (let i = 0; i < claimed.length; i++) if (touched[i]) claimed[i] = 1;
    }
  }

  /** HTP-merge the outgoing tracks' current looks (× their opacity) into `out`. */
  private _combineLook(ids: string[], universe: Universe, ctx: MixContext, out: Uint8Array): void {
    out.fill(0);
    for (const id of ids) {
      const t = this.tracks.get(id);
      if (!t || t.opacity <= 0) continue;
      const src = this._frame(t, universe, ctx);
      if (!src) continue;
      const op = t.opacity >= 1 ? 1 : t.opacity;
      for (let i = 0; i < out.length; i++) {
        const v = (src[i] * op) | 0;
        if (v > out[i]) out[i] = v;
      }
    }
  }

  /** The dipless crossfade source for `tr` this tick: lerp(from, to·level, f). */
  private _transitionFrame(tr: Transition, target: SceneTrack, universe: Universe, ctx: MixContext): Uint8Array {
    const from = tr.from[universe.id];
    const to = this._frame(target, universe, ctx);
    const f = tr.totalMs > 0 ? clamp01(tr.elapsedMs / tr.totalMs) : 1;
    const level = clamp01(tr.level);
    const out = this._transScratch;
    for (let i = 0; i < out.length; i++) {
      const va = from ? from[i] : 0;
      const vb = to ? (to[i] * level) | 0 : 0;
      out[i] = (va + (vb - va) * f) & 0xff;
    }
    return out;
  }

  /**
   * The buffer this track contributes for `universe` this tick. Static tracks
   * return their stored look; dynamic tracks compute an animated frame from
   * their phase clock (chase step / colour rainbow / pan-tilt sweep), honouring
   * direction and any pinned transport step. Returns null when the track has
   * nothing for this universe (skip the blend).
   */
  _frame(t: SceneTrack, universe: Universe, ctx: MixContext): Uint8Array | null {
    const uid = universe.id;
    const pb = this.playback.get(t.id);

    // Base look: a chase walk or the static stored values.
    const base = t.type === 'chase'
      ? this._chaseFrame(t, uid, pb, ctx, this._baseScratch)
      : (t.values[uid] ?? null);

    // No FX rack → just the base.
    if (!t.layers || !t.layers.length) return base;

    // Composite the rack over the base (bottom→top, top layer wins on conflict).
    const out = this._scratch;
    if (base) out.set(base); else out.fill(0);
    let any = base != null;
    for (const L of t.layers) {
      if (!L.enabled) continue;
      const targets = L.targets?.[uid];
      if (!targets || !targets.length) continue;
      const period = this.layerPeriod(L);
      const clock = pb?.layerPhaseMs?.[L.id] ?? ctx.now;
      const now = effectiveNow(clock, period, L.direction ?? 'forward');
      applyLayer(out, L, targets, L.positions?.[uid], now, period);
      any = true;
    }
    return any ? out : null;
  }

  /** Chase look for `uid` written into `scratch` (crossfade-aware). */
  private _chaseFrame(
    t: SceneTrack, uid: number, pb: ScenePlayback | undefined, ctx: MixContext, scratch: Uint8Array,
  ): Uint8Array | null {
    const steps = t.stepValues;
    const n = steps?.length ?? 0;
    if (!n) return t.values[uid] ?? null;
    const clock = pb?.phaseMs ?? ctx.now;
    const period = this.effectivePeriod(t);
    const dir = t.direction ?? 'forward';

    // pinned by transport → that step's solid look
    if (pb?.manualStep != null) return steps![(((pb.manualStep % n) + n) % n)][uid] ?? null;

    // BPM-synced (or untimed legacy) chases step uniformly, no crossfade
    const timings = t.stepTimings;
    if (t.driveMode === 'bpm' || !timings) return steps![stepIndex(clock, period, n, dir)][uid] ?? null;

    // free-run timed cue list: walk fade+wait segments in play order, crossfading
    const seq = chaseSeq(n, dir);
    let cycle = 0;
    for (const si of seq) cycle += Math.max(0, timings[si]?.fadeMs ?? 0) + Math.max(0, timings[si]?.waitMs ?? 0);
    if (cycle <= 0) return steps![seq[0]][uid] ?? null;

    let tt = (((clock * (t.speed ?? 1)) % cycle) + cycle) % cycle;
    for (let k = 0; k < seq.length; k++) {
      const si = seq[k];
      const fade = Math.max(0, timings[si]?.fadeMs ?? 0);
      const wait = Math.max(0, timings[si]?.waitMs ?? 0);
      if (tt < fade) {
        const prev = seq[(k - 1 + seq.length) % seq.length];
        return crossfadeInto(scratch, steps![prev][uid], steps![si][uid], fade > 0 ? tt / fade : 1);
      }
      tt -= fade;
      if (tt < wait) return steps![si][uid] ?? null;
      tt -= wait;
    }
    return steps![seq[seq.length - 1]][uid] ?? null;
  }
}

/**
 * HTP-blend `src` into `dst` (max, scaled by opacity), but skip channels already
 * `claimed` by a higher priority tier and record every channel this source writes
 * into `touched` (so the caller can claim them for lower tiers).
 */
function blendMaskedHTP(dst: Uint8Array, src: Uint8Array, opacity: number, claimed: Uint8Array, touched: Uint8Array): void {
  const op = opacity <= 0 ? 0 : opacity >= 1 ? 1 : opacity;
  for (let i = 0; i < dst.length && i < src.length; i++) {
    if (claimed[i]) continue;
    if (src[i] > 0) touched[i] = 1;
    const s = (src[i] * op) | 0;
    if (s > dst[i]) dst[i] = s;
  }
}

/** LTP variant of {@link blendMaskedHTP} (crossfade) — skips claimed, marks touched. */
function blendMaskedLTP(dst: Uint8Array, src: Uint8Array, opacity: number, claimed: Uint8Array, touched: Uint8Array): void {
  const op = opacity <= 0 ? 0 : opacity >= 1 ? 1 : opacity;
  if (op <= 0) return;
  for (let i = 0; i < dst.length && i < src.length; i++) {
    if (claimed[i]) continue;
    if (src[i] > 0) touched[i] = 1;
    dst[i] = (src[i] * op + dst[i] * (1 - op)) | 0;
  }
}

/** Composite one FX layer onto `out` at its target addresses (top layer wins). */
function applyLayer(out: Uint8Array, L: TrackLayer, targets: number[][], positions: { x: number; y: number }[] | undefined, now: number, period: number): void {
  switch (L.kind) {
    case 'color':  renderColorFx(out, targets, now, period, L.spread ?? 30, L.color); break;
    case 'move':   renderMoveFx(out, targets, now, period, L.size ?? 96, L.spread ?? 30, L.move); break;
    case 'curve':  renderWaveFx(out, targets, now, period, L.spread ?? 30, L.curve); break;
    case 'value':  renderWaveFx(out, targets, now, period, L.spread ?? 30, L.value); break;
    case 'chaser': renderChaserFx(out, targets, now, period, L.chaser); break;
    case 'matrix': if (positions) renderMatrixFx(out, targets, positions, now, period, L.matrix); break;
  }
}

function isDynamic(type?: SceneTrackType): boolean {
  return type === 'chase';
}
