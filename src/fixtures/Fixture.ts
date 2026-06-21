import type { FixtureDefinition } from './FixtureDefinition';
import type { FixtureMode } from './FixtureMode';
import { DMX_CHANNELS } from '../core/Universe';
import { type StageTransform, type Vec2, DEFAULT_TRANSFORM, sanitizeTransform, normalizeTransform, emitterWorldPositions, resolveEmitterCount } from './emitterGeometry';

/**
 * Fixture — patched instance of a FixtureDefinition + FixtureMode.
 *
 *   universeId      engine universe id
 *   startAddress    1-based DMX channel of first slot
 *   values          Uint8Array, length = mode.channelCount; current state
 *
 * State model: writes go into `values` immediately. Call `apply(universe)`
 * to flush into a Universe's programmer buffer. Alternative `liveApply` flag
 * auto-flushes on every set (cheap for skeleton).
 *
 * Setters by channel type id:
 *   fx.set('intensity', 255)
 *   fx.set('red', 128)
 * Setters by channel index (1-based fixture-local):
 *   fx.setChannel(1, 200)
 *
 * Helpers:
 *   fx.setRGB(r,g,b)      writes red/green/blue if present
 *   fx.setRGBW(r,g,b,w)
 *   fx.setPanTilt(p,t)    16-bit-aware if pan-fine/tilt-fine in mode
 *   fx.applyDefaults()    fill values from each channel's defaultValue
 */

/** Minimal structural target a Fixture can flush its values into. */
export interface UniverseTarget {
  setChannel(channel: number, value: number): void;
}

/**
 * One synthetic per-cluster virtual dimmer on an RGB-only fixture (a fixture
 * with colour mixing but no intensity channel). `virtualAddr` is a universe
 * address in the virtual region (above {@link DMX_CHANNELS}), derived as
 * `DMX_CHANNELS + r` so it is unique and stable; `r`/`g`/`b`(`/w`) are the
 * cluster's real DMX addresses the engine scales by this dimmer's value.
 */
export interface VirtualDimmerCluster { virtualAddr: number; r: number; g: number; b: number; w?: number; }

/**
 * Per-fixture output limitations — clamp / shape the final mixed output safely,
 * regardless of which source (scene / FX / live) drove it. Ranges are in coarse
 * DMX (0..255); the engine's Limits module applies them 16-bit-aware when a fine
 * channel exists. All optional — absent means "no limit".
 */
export interface FixtureLimits {
  dimmer?: { max: number };                                 // 0..255 cap on intensity channels
  pan?:  { min: number; max: number; invert?: boolean };    // 0..255 coarse sub-range + invert
  tilt?: { min: number; max: number; invert?: boolean };
  swapPanTilt?: boolean;                                    // route pan output to the tilt channel & vice-versa
}

/** Options bag accepted by the `Fixture` constructor. */
export interface FixtureOptions {
  id?: string;
  name?: string | null;
  definition: FixtureDefinition;
  mode?: FixtureMode | string | null;
  universeId?: number;
  startAddress: number;
  liveApply?: boolean;
  /** 2D top-down placement on the STAGE tile (world units + degrees). */
  stageTransform?: Partial<StageTransform> | null;
  /** Per-fixture output limitations (pan/tilt range, invert, swap, dimmer cap). */
  limits?: FixtureLimits | null;
}

export class Fixture {
  id: string;
  name: string;
  definition: FixtureDefinition;
  mode: FixtureMode;
  universeId: number;
  startAddress: number;
  values: Uint8Array;
  /** Per-cluster virtual dimmer levels (RGB-only fixtures), index-aligned with
   *  {@link virtualDimmers}. 0..255, default 0. Flushed to the virtual channel
   *  region by {@link apply}; empty for fixtures with a real intensity channel. */
  virtualLevels: Uint8Array;
  liveApply: boolean;
  /** 2D top-down placement on the STAGE tile (world units + degrees). */
  stageTransform: StageTransform;
  /** Per-fixture output limitations, or null when unconstrained. */
  limits: FixtureLimits | null;
  _universeRef: UniverseTarget | null;

  constructor({
    id, name, definition, mode, universeId = 0, startAddress,
    liveApply = false, stageTransform = null, limits = null,
  }: FixtureOptions) {
    if (!definition) throw new Error('Fixture needs definition');
    const m = typeof mode === 'string' ? definition.mode(mode) : (mode ?? definition.defaultMode);
    if (!m) throw new Error('Fixture needs mode (definition has no modes)');
    this.id = id ?? `fx_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name ?? definition.model ?? '';
    this.definition = definition;
    this.mode = m;
    this.universeId = universeId;
    this.startAddress = startAddress;
    this.values = new Uint8Array(m.channelCount);
    this.virtualLevels = new Uint8Array(this.virtualDimmers().length);
    this.liveApply = liveApply;
    this.stageTransform = stageTransform ? sanitizeTransform(stageTransform) : { ...DEFAULT_TRANSFORM };
    this.limits = limits ?? null;
    this._universeRef = null; // set when liveApply target attached
    this.applyDefaults();
  }

  get channelCount(): number { return this.mode.channelCount; }
  get endAddress(): number   { return this.startAddress + this.channelCount - 1; }

  /**
   * Number of light-emitting cells, derived from THIS mode's channel layout —
   * colour clusters (a 9-LED bar's 9 R/G/B groups → 9), an explicit definition
   * `emitterLayout`, or a declared `emitters` count; at least 1. Mode-dependent,
   * so different modes of the same fixture can expose different cell counts.
   */
  get emitterCount(): number {
    return resolveEmitterCount(this.mode.channels, this.definition.emitterLayout, this.definition.emitters);
  }

  applyDefaults(): void {
    this.mode.channels.forEach((c, i) => { if (c) this.values[i] = c.defaultValue; });
    this.virtualLevels?.fill(255);   // virtual dimmers rest at full — an RGB-only fixture shows colour at 100% unless dimmed
  }

  /** Attach live target so writes auto-flush. Pass null to detach. */
  bind(universe: UniverseTarget | null): void {
    this._universeRef = universe;
    if (universe) this.apply(universe);
  }

  /** Write by 1-based fixture-local channel. */
  setChannel(channel: number, value: number): void {
    const i = channel - 1;
    if (i < 0 || i >= this.values.length) return;
    this.values[i] = value & 0xff;
    if (this.liveApply && this._universeRef) {
      this._universeRef.setChannel(this.startAddress + i, this.values[i]);
    }
  }

  /**
   * Write by channel-type id. Returns true if the type existed. For an RGB-only
   * fixture, an `intensity`/`intensity-master` write with no real channel drives
   * every virtual dimmer (whole-fixture intensity), so group/master dimmers work.
   */
  set(typeId: string, value: number): boolean {
    const idx = this.mode.indexOfType(typeId);
    if (!idx) {
      if ((typeId === 'intensity' || typeId === 'intensity-master') && this.virtualLevels.length) {
        const v = value & 0xff;
        this.virtualLevels.fill(v);
        if (this.liveApply && this._universeRef) {
          for (const vd of this.virtualDimmers()) this._universeRef.setChannel(vd.virtualAddr, v);
        }
        return true;
      }
      return false;
    }
    this.setChannel(idx, value);
    return true;
  }

  /** Write 16-bit value across a coarse + matching fine channel pair. */
  set16(coarseTypeId: string, value16: number): void {
    const v = Math.max(0, Math.min(0xffff, value16 | 0));
    const coarse = (v >> 8) & 0xff;
    const fine   = v & 0xff;
    this.set(coarseTypeId, coarse);
    // find fine counterpart by `fineOf`
    const fineDef = this.mode.channels.find((c) => c && c.type?.fineOf === coarseTypeId);
    if (fineDef) this.set(fineDef.typeId, fine);
  }

  get(typeId: string): number {
    const idx = this.mode.indexOfType(typeId);
    return idx ? this.values[idx - 1] : 0;
  }

  setRGB(r: number, g: number, b: number): void   { this.set('red', r); this.set('green', g); this.set('blue', b); }
  setRGBW(r: number, g: number, b: number, w: number): void { this.setRGB(r, g, b); this.set('white', w); }
  setPanTilt(pan16: number, tilt16: number): void { this.set16('pan', pan16); this.set16('tilt', tilt16); }

  /** Flush current `values` (+ any virtual dimmer levels) into universe's programmer buffer. */
  apply(universe: UniverseTarget): void {
    for (let i = 0; i < this.values.length; i++) {
      universe.setChannel(this.startAddress + i, this.values[i]);
    }
    this.applyVirtual(universe);
  }

  /** Flush only the virtual dimmer levels into the universe (seed full-by-default). */
  applyVirtual(universe: UniverseTarget): void {
    const vds = this.virtualDimmers();
    for (let k = 0; k < vds.length; k++) universe.setChannel(vds[k].virtualAddr, this.virtualLevels[k] ?? 0);
  }

  /** All 1-based DMX addresses (universe-absolute) that are intensity-typed. */
  intensityAddresses(): number[] {
    const local = this.mode.indicesWhere((c) => !!c.type?.isIntensity);
    return local.map((i) => this.startAddress + i - 1);
  }

  /** Returns 1-based DMX address of a typed channel (or 0). */
  addressOf(typeId: string): number {
    const idx = this.mode.indexOfType(typeId);
    return idx ? this.startAddress + idx - 1 : 0;
  }

  /** 1-based DMX address of the fine channel paired with a coarse type (or 0). */
  fineAddressOf(coarseTypeId: string): number {
    const i = this.mode.channels.findIndex((c) => c && c.type?.fineOf === coarseTypeId);
    return i >= 0 ? this.startAddress + i : 0;
  }

  /** All 1-based DMX addresses (universe-absolute) of a given channel type, in mode order. */
  addressesOf(typeId: string): number[] {
    return this.mode.indicesWhere((c) => c.typeId === typeId).map((i) => this.startAddress + i - 1);
  }

  /**
   * Per-emitter RGB(W) channel addresses (universe-absolute), one entry per
   * emitter cell in mode order. Normally one colour cluster per cell; a fixture
   * with a single cluster but several cells (one colour driving a whole shape)
   * replicates that cluster across all cells. Index-aligned with
   * {@link emitterWorldPositions}. Empty if the fixture has no colour mixing.
   */
  emitterColorAddresses(): { r: number; g: number; b: number; w?: number }[] {
    const reds = this.addressesOf('red');
    const greens = this.addressesOf('green');
    const blues = this.addressesOf('blue');
    const whites = this.addressesOf('white');
    const ncol = Math.min(reds.length, greens.length, blues.length);
    if (!ncol) return [];
    const n = ncol === 1 ? this.emitterCount : ncol;   // replicate a single cluster across every cell
    const out: { r: number; g: number; b: number; w?: number }[] = [];
    for (let k = 0; k < n; k++) {
      const j = ncol === 1 ? 0 : k;
      out.push(whites.length === ncol ? { r: reds[j], g: greens[j], b: blues[j], w: whites[j] } : { r: reds[j], g: greens[j], b: blues[j] });
    }
    return out;
  }

  /** True if the mode has any intensity-typed channel (master or per-element dimmer). */
  hasIntensityChannel(): boolean {
    return this.mode.indicesWhere((c) => !!c.type?.isIntensity).length > 0;
  }

  /**
   * Whether this fixture needs virtual dimmers: it mixes colour (≥1 RGB cluster)
   * but has no intensity channel of its own, so brightness can only be ridden by
   * scaling its RGB output. See {@link virtualDimmers}.
   */
  needsVirtualDimmer(): boolean {
    return !this.hasIntensityChannel() && this.emitterColorAddresses().length > 0;
  }

  /**
   * Synthetic per-cluster virtual dimmers for an RGB-only fixture — one entry per
   * colour cluster (a multi-cluster bar yields several; a single-cluster par one).
   * Each carries a stable virtual-region address (`DMX_CHANNELS + r`) the engine's
   * VirtualDimmer stage reads to scale that cluster's RGB(W). Empty unless
   * {@link needsVirtualDimmer}.
   */
  virtualDimmers(): VirtualDimmerCluster[] {
    if (!this.needsVirtualDimmer()) return [];
    return this.emitterColorAddresses().map((c) => ({ virtualAddr: DMX_CHANNELS + c.r, r: c.r, g: c.g, b: c.b, ...(c.w != null ? { w: c.w } : {}) }));
  }

  /** Per-emitter 2D world positions (top-down stage), index-aligned with emitters. */
  emitterWorldPositions(): Vec2[] {
    return emitterWorldPositions({ emitters: this.emitterCount, emitterLayout: this.definition.emitterLayout }, this.stageTransform);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      definitionId: this.definition.id,
      modeId: this.mode.id,
      universeId: this.universeId,
      startAddress: this.startAddress,
      // Persisted normalised (0..1 per axis) over the fixed stage box; restored to
      // world units in `restoreProject`. Runtime keeps world units.
      stageTransform: normalizeTransform(this.stageTransform),
      ...(this.limits ? { limits: this.limits } : {}),
    };
  }
}
