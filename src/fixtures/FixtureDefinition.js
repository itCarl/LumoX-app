import { FixtureMode } from './FixtureMode.js';

/**
 * FixtureDefinition — fixture profile (manufacturer + model + list of modes).
 *
 * Identity: `${manufacturer}/${model}` is the canonical key in the library.
 *
 * Optional sub-objects:
 *   meta        authorship, version, timestamps, notes, source URL
 *   physical    real-world specs (dimensions, weight, bulb, lens, focus, power)
 *
 * All optional sub-fields default to `null` so JSON stays compact for
 * fixtures that don't ship the data.
 */
export class FixtureDefinition {
  constructor({
    id, manufacturer, model, type = 'Other',
    emitters = 1,
    modes = [],
    meta = {},
    physical = {},
  } = {}) {
    this.id = id ?? `${manufacturer}/${model}`;
    this.manufacturer = manufacturer;
    this.model = model;
    this.type = type;   // 'Moving Head' | 'PAR' | 'Strobe' | 'LED Bar' | ...
    this.emitters = Math.max(1, emitters | 0);  // light-emitting cells shown on the stage
    this.modes = modes.map((m) => (m instanceof FixtureMode ? m : FixtureMode.fromJSON(m)));

    this.meta = {
      author: null,         // string — who wrote this profile
      version: '1.0.0',     // semver string
      createdAt: null,      // ISO 8601 date string
      modifiedAt: null,     // ISO 8601 date string
      source: null,         // URL or note where info came from
      notes: null,          // free text
      ...meta,
    };

    this.physical = {
      dimensions: null,     // { width, height, depth, unit: 'mm' }
      weight: null,         // { value, unit: 'kg' }
      bulb: null,           // { type: 'LED'|'Halogen'|..., lumens, colourTemperature }
      lens: null,           // { name, degreesMin, degreesMax }
      focus: null,          // { type: 'Fixed'|'Head'|'Mirror', panMax, tiltMax }
      power: null,          // { consumption, unit: 'W' }
      ...physical,
    };
  }

  mode(idOrName) {
    return this.modes.find((m) => m.id === idOrName || m.name === idOrName) ?? null;
  }

  get defaultMode() { return this.modes[0] ?? null; }

  /** Stamp `modifiedAt` to current time. Call after any mutation. */
  touch(date = new Date()) {
    this.meta.modifiedAt = date.toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      manufacturer: this.manufacturer,
      model: this.model,
      type: this.type,
      emitters: this.emitters,
      meta: this.meta,
      physical: this.physical,
      modes: this.modes.map((m) => m.toJSON()),
    };
  }

  static fromJSON(obj) { return new FixtureDefinition(obj); }
}
