import { ChannelTypeRegistry } from './ChannelType.js';

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
export class Fixture {
  constructor({
    id, name, definition, mode, universeId, startAddress,
    liveApply = false,
  }) {
    if (!definition) throw new Error('Fixture needs definition');
    const m = typeof mode === 'string' ? definition.mode(mode) : (mode ?? definition.defaultMode);
    if (!m) throw new Error('Fixture needs mode (definition has no modes)');
    this.id = id ?? `fx_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name ?? definition.model;
    this.definition = definition;
    this.mode = m;
    this.universeId = universeId;
    this.startAddress = startAddress;
    this.values = new Uint8Array(m.channelCount);
    this.liveApply = liveApply;
    this._universeRef = null; // set when liveApply target attached
    this.applyDefaults();
  }

  get channelCount() { return this.mode.channelCount; }
  get endAddress()   { return this.startAddress + this.channelCount - 1; }

  applyDefaults() {
    this.mode.channels.forEach((c, i) => { if (c) this.values[i] = c.defaultValue; });
  }

  /** Attach live target so writes auto-flush. Pass null to detach. */
  bind(universe) {
    this._universeRef = universe;
    if (universe) this.apply(universe);
  }

  /** Write by 1-based fixture-local channel. */
  setChannel(channel, value) {
    const i = channel - 1;
    if (i < 0 || i >= this.values.length) return;
    this.values[i] = value & 0xff;
    if (this.liveApply && this._universeRef) {
      this._universeRef.setChannel(this.startAddress + i, this.values[i]);
    }
  }

  /** Write by channel-type id. Returns true if a channel of that type existed. */
  set(typeId, value) {
    const idx = this.mode.indexOfType(typeId);
    if (!idx) return false;
    this.setChannel(idx, value);
    return true;
  }

  /** Write 16-bit value across a coarse + matching fine channel pair. */
  set16(coarseTypeId, value16) {
    const v = Math.max(0, Math.min(0xffff, value16 | 0));
    const coarse = (v >> 8) & 0xff;
    const fine   = v & 0xff;
    this.set(coarseTypeId, coarse);
    // find fine counterpart by `fineOf`
    const fineDef = this.mode.channels.find((c) => c && c.type?.fineOf === coarseTypeId);
    if (fineDef) this.set(fineDef.typeId, fine);
  }

  get(typeId) {
    const idx = this.mode.indexOfType(typeId);
    return idx ? this.values[idx - 1] : 0;
  }

  setRGB(r, g, b)   { this.set('red', r); this.set('green', g); this.set('blue', b); }
  setRGBW(r, g, b, w) { this.setRGB(r, g, b); this.set('white', w); }
  setPanTilt(pan16, tilt16) { this.set16('pan', pan16); this.set16('tilt', tilt16); }

  /** Flush current `values` into universe's programmer buffer. */
  apply(universe) {
    for (let i = 0; i < this.values.length; i++) {
      universe.setChannel(this.startAddress + i, this.values[i]);
    }
  }

  /** All 1-based DMX addresses (universe-absolute) that are intensity-typed. */
  intensityAddresses() {
    const local = this.mode.indicesWhere((c) => c.type?.isIntensity);
    return local.map((i) => this.startAddress + i - 1);
  }

  /** Returns 1-based DMX address of a typed channel (or 0). */
  addressOf(typeId) {
    const idx = this.mode.indexOfType(typeId);
    return idx ? this.startAddress + idx - 1 : 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      definitionId: this.definition.id,
      modeId: this.mode.id,
      universeId: this.universeId,
      startAddress: this.startAddress,
    };
  }
}
