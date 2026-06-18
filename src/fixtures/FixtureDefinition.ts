import { FixtureMode } from './FixtureMode';
import type { ModeJSON } from './FixtureMode';

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

/** Authorship / provenance metadata block. */
export interface FixtureMeta {
  author?: string | null;       // string — who wrote this profile
  version?: string;             // semver string
  createdAt?: string | null;    // ISO 8601 date string
  modifiedAt?: string | null;   // ISO 8601 date string
  source?: string | null;       // URL or note where info came from
  notes?: string | null;        // free text
  [key: string]: unknown;
}

/** Real-world physical specs block. All sub-objects default to null. */
export interface FixturePhysical {
  dimensions?: { width?: number | null; height?: number | null; depth?: number | null; unit?: string } | null;
  weight?: { value?: number | null; unit?: string } | null;
  bulb?: { type?: string | null; lumens?: number | null; colourTemperature?: number | null } | null;
  lens?: { name?: string | null; degreesMin?: number | null; degreesMax?: number | null } | null;
  focus?: { type?: string | null; panMax?: number | null; tiltMax?: number | null } | null;
  power?: { consumption?: number | null; unit?: string } | null;
  [key: string]: unknown;
}

/** JSON shape of a full fixture definition (round-trips via `toJSON`/`fromJSON`). */
export interface FixtureDefinitionJSON {
  id?: string;
  manufacturer?: string;
  model?: string;
  type?: string;
  emitters?: number;
  meta?: FixtureMeta;
  physical?: FixturePhysical;
  modes?: (FixtureMode | ModeJSON)[];
}

/** Options bag accepted by the `FixtureDefinition` constructor. */
export type FixtureDefinitionOptions = FixtureDefinitionJSON;

export class FixtureDefinition {
  id: string;
  manufacturer?: string;
  model?: string;
  type: string;
  emitters: number;
  modes: FixtureMode[];
  meta: FixtureMeta;
  physical: FixturePhysical;
  /** Origin tag set by `FixtureLibrary.add` ('builtin' | 'user' | ...). */
  source?: string;

  constructor({
    id, manufacturer, model, type = 'Other',
    emitters = 1,
    modes = [],
    meta = {},
    physical = {},
  }: FixtureDefinitionOptions = {}) {
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

  mode(idOrName: string): FixtureMode | null {
    return this.modes.find((m) => m.id === idOrName || m.name === idOrName) ?? null;
  }

  get defaultMode(): FixtureMode | null { return this.modes[0] ?? null; }

  /** Stamp `modifiedAt` to current time. Call after any mutation. */
  touch(date: Date = new Date()): void {
    this.meta.modifiedAt = date.toISOString();
  }

  toJSON(): FixtureDefinitionJSON {
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

  static fromJSON(obj: FixtureDefinitionOptions): FixtureDefinition { return new FixtureDefinition(obj); }
}
