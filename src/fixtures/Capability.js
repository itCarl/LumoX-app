/**
 * Capability — labelled value range on a single channel.
 * Modular via `CapabilityRegistry`. Subclasses encode the *kind* of meaning
 * (color preset, gobo image, strobe rate, shutter state, ...).
 *
 * Range matches: min <= value <= max (8-bit).
 *
 * Subclasses should set `static KIND = '...'` for serialization round-trip.
 */
export class Capability {
  static KIND = 'range';

  constructor({ min, max, label, kind: _kind, ...rest } = {}) {
    if (min == null || max == null) throw new Error('Capability needs min + max');
    this.min = min & 0xff;
    this.max = max & 0xff;
    this.label = label ?? `${this.min}-${this.max}`;
    // `kind` is a class getter — strip from rest to avoid setter error.
    Object.assign(this, rest);
  }

  get kind() { return this.constructor.KIND; }
  matches(value) { return value >= this.min && value <= this.max; }

  /** Serializable plain object. Subclasses should override to add fields. */
  toJSON() {
    return { kind: this.kind, min: this.min, max: this.max, label: this.label };
  }
}

/** Solid color preset. `color` = hex string. */
export class ColorCapability extends Capability {
  static KIND = 'color';
  constructor(opts) { super(opts); this.color = opts.color ?? '#ffffff'; }
  toJSON() { return { ...super.toJSON(), color: this.color }; }
}

/** Gobo with optional image resource id. */
export class GoboCapability extends Capability {
  static KIND = 'gobo';
  constructor(opts) {
    super(opts);
    this.image = opts.image ?? null;     // path or resource id
    this.shake = !!opts.shake;
  }
  toJSON() { return { ...super.toJSON(), image: this.image, shake: this.shake }; }
}

/** Strobe / shutter state. mode: 'open'|'closed'|'strobe'|'pulse'|'random'. rateHz optional. */
export class ShutterCapability extends Capability {
  static KIND = 'shutter';
  constructor(opts) {
    super(opts);
    this.mode = opts.mode ?? 'open';
    this.rateHz = opts.rateHz ?? null;
  }
  toJSON() { return { ...super.toJSON(), mode: this.mode, rateHz: this.rateHz }; }
}

/** Internal effect macro (built-in chase, fade, ...). */
export class EffectCapability extends Capability {
  static KIND = 'effect';
  constructor(opts) { super(opts); this.effectName = opts.effectName ?? opts.label; }
  toJSON() { return { ...super.toJSON(), effectName: this.effectName }; }
}

export class CapabilityRegistry {
  static _kinds = new Map();

  static register(klass) {
    if (!klass.KIND) throw new Error('Capability subclass must define static KIND');
    CapabilityRegistry._kinds.set(klass.KIND, klass);
  }

  static get(kind) { return CapabilityRegistry._kinds.get(kind); }
  static kinds()   { return [...CapabilityRegistry._kinds.keys()]; }

  /** Reconstruct from JSON shape produced by `Capability.toJSON()`. */
  static fromJSON(obj) {
    const Klass = CapabilityRegistry.get(obj.kind) ?? Capability;
    return new Klass(obj);
  }
}

// Bootstrap built-ins
[Capability, ColorCapability, GoboCapability, ShutterCapability, EffectCapability]
  .forEach((k) => CapabilityRegistry.register(k));
