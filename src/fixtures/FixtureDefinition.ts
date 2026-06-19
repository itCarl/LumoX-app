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

/**
 * EmitterCell — one light-emitting cell of the fixture, positioned in
 * normalized 0..1 coordinates within the fixture's bounding box (origin
 * top-left). Resolution-independent so matrix effects can map effects onto the
 * physical layout regardless of how it's drawn.
 */
export interface EmitterCell {
  x: number;   // 0..1
  y: number;   // 0..1
}

/** Hard cap on emitter count — mirrors the editor's input bound. */
const MAX_EMITTERS = 1024;

/**
 * Sanitize an emitter layout: keep only finite {x,y} pairs, clamp to 0..1, and
 * cap the count. Returns null for empty/invalid input (no layout). Defensive —
 * `library:add` feeds untrusted JSON straight through `fromJSON`.
 */
function sanitizeEmitterLayout(layout: unknown): EmitterCell[] | null {
  if (!Array.isArray(layout)) return null;
  const clamp = (v: unknown) => Math.min(1, Math.max(0, Number(v)));
  const out: EmitterCell[] = [];
  for (const c of layout) {
    if (out.length >= MAX_EMITTERS) break;
    const x = clamp((c as EmitterCell)?.x);
    const y = clamp((c as EmitterCell)?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out.length ? out : null;
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
  emitterLayout?: EmitterCell[] | null;
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
  /** Per-emitter normalized positions (0..1). null = no explicit layout. */
  emitterLayout: EmitterCell[] | null;
  modes: FixtureMode[];
  meta: FixtureMeta;
  physical: FixturePhysical;
  /** Origin tag set by `FixtureLibrary.add` ('builtin' | 'user' | ...). */
  source?: string;

  constructor({
    id, manufacturer, model, type = 'Other',
    emitters = 1,
    emitterLayout = null,
    modes = [],
    meta = {},
    physical = {},
  }: FixtureDefinitionOptions = {}) {
    this.id = id ?? `${manufacturer}/${model}`;
    this.manufacturer = manufacturer;
    this.model = model;
    this.type = type;   // 'Moving Head' | 'PAR' | 'Strobe' | 'LED Bar' | ...
    // light-emitting cells shown on the stage. A positioned layout, when
    // present, is the source of truth for the count; otherwise fall back to the
    // plain numeric `emitters`.
    this.emitterLayout = sanitizeEmitterLayout(emitterLayout);
    this.emitters = this.emitterLayout ? this.emitterLayout.length : Math.max(1, emitters | 0);
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
      // Only emit a layout when one exists — keeps built-in profiles compact.
      ...(this.emitterLayout ? { emitterLayout: this.emitterLayout } : {}),
      meta: this.meta,
      physical: this.physical,
      modes: this.modes.map((m) => m.toJSON()),
    };
  }

  static fromJSON(obj: FixtureDefinitionOptions): FixtureDefinition { return new FixtureDefinition(obj); }
}
