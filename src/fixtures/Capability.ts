/**
 * Capability — labelled value range on a single channel.
 * Modular via `CapabilityRegistry`. Subclasses encode the *kind* of meaning
 * (color preset, gobo image, strobe rate, shutter state, ...).
 *
 * Range matches: min <= value <= max (8-bit).
 *
 * Subclasses should set `static KIND = '...'` for serialization round-trip.
 */

/** JSON shape produced by `Capability.toJSON()` (subclasses add fields). */
export interface CapabilityJSON {
  kind: string;
  min: number;
  max: number;
  label: string;
  [key: string]: unknown;
}

/** Options bag accepted by the `Capability` constructor. */
export interface CapabilityOptions {
  min?: number;
  max?: number;
  label?: string | null;
  kind?: string;
  [key: string]: unknown;
}

export class Capability {
  static KIND = 'range';

  min: number;
  max: number;
  label: string;
  // Subclasses assign extra fields via `Object.assign` / explicit declarations.
  [key: string]: unknown;

  constructor({ min, max, label, kind: _kind, ...rest }: CapabilityOptions = {}) {
    if (min == null || max == null) throw new Error('Capability needs min + max');
    this.min = min & 0xff;
    this.max = max & 0xff;
    this.label = label ?? `${this.min}-${this.max}`;
    // `kind` is a class getter — strip from rest to avoid setter error.
    Object.assign(this, rest);
  }

  get kind(): string { return (this.constructor as typeof Capability).KIND; }
  matches(value: number): boolean { return value >= this.min && value <= this.max; }

  /** Serializable plain object. Subclasses should override to add fields. */
  toJSON(): CapabilityJSON {
    return { kind: this.kind, min: this.min, max: this.max, label: this.label };
  }
}

/** Options for `ColorCapability`. */
export interface ColorCapabilityOptions extends CapabilityOptions {
  color?: string | null;
}

/** Solid color preset. `color` = hex string. */
export class ColorCapability extends Capability {
  static KIND = 'color';
  color: string;
  constructor(opts: ColorCapabilityOptions) { super(opts); this.color = opts.color ?? '#ffffff'; }
  toJSON(): CapabilityJSON { return { ...super.toJSON(), color: this.color }; }
}

/** Options for `GoboCapability`. */
export interface GoboCapabilityOptions extends CapabilityOptions {
  image?: string | null;
  shake?: boolean;
}

/** Gobo with optional image resource id. */
export class GoboCapability extends Capability {
  static KIND = 'gobo';
  image: string | null;
  shake: boolean;
  constructor(opts: GoboCapabilityOptions) {
    super(opts);
    this.image = opts.image ?? null;     // path or resource id
    this.shake = !!opts.shake;
  }
  toJSON(): CapabilityJSON { return { ...super.toJSON(), image: this.image, shake: this.shake }; }
}

/** Options for `ShutterCapability`. */
export interface ShutterCapabilityOptions extends CapabilityOptions {
  mode?: string | null;
  rateHz?: number | null;
}

/** Strobe / shutter state. mode: 'open'|'closed'|'strobe'|'pulse'|'random'. rateHz optional. */
export class ShutterCapability extends Capability {
  static KIND = 'shutter';
  mode: string;
  rateHz: number | null;
  constructor(opts: ShutterCapabilityOptions) {
    super(opts);
    this.mode = opts.mode ?? 'open';
    this.rateHz = opts.rateHz ?? null;
  }
  toJSON(): CapabilityJSON { return { ...super.toJSON(), mode: this.mode, rateHz: this.rateHz }; }
}

/** Options for `EffectCapability`. */
export interface EffectCapabilityOptions extends CapabilityOptions {
  effectName?: string | null;
}

/** Internal effect macro (built-in chase, fade, ...). */
export class EffectCapability extends Capability {
  static KIND = 'effect';
  effectName: string | null;
  constructor(opts: EffectCapabilityOptions) { super(opts); this.effectName = opts.effectName ?? opts.label ?? null; }
  toJSON(): CapabilityJSON { return { ...super.toJSON(), effectName: this.effectName }; }
}

/** Constructor type for any `Capability` subclass with a static `KIND`. */
export interface CapabilityClass {
  KIND: string;
  new (opts: CapabilityOptions): Capability;
}

export class CapabilityRegistry {
  static _kinds: Map<string, CapabilityClass> = new Map();

  static register(klass: CapabilityClass): void {
    if (!klass.KIND) throw new Error('Capability subclass must define static KIND');
    CapabilityRegistry._kinds.set(klass.KIND, klass);
  }

  static get(kind: string): CapabilityClass | undefined { return CapabilityRegistry._kinds.get(kind); }
  static kinds(): string[]   { return [...CapabilityRegistry._kinds.keys()]; }

  /** Reconstruct from JSON shape produced by `Capability.toJSON()`. */
  static fromJSON(obj: CapabilityJSON | CapabilityOptions): Capability {
    const Klass = CapabilityRegistry.get((obj as CapabilityJSON).kind) ?? Capability;
    return new Klass(obj);
  }
}

// Bootstrap built-ins
([Capability, ColorCapability, GoboCapability, ShutterCapability, EffectCapability] as CapabilityClass[])
  .forEach((k) => CapabilityRegistry.register(k));
