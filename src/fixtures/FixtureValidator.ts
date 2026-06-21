import { ChannelTypeRegistry } from './ChannelType';
import { CapabilityRegistry } from './Capability';

/**
 * FixtureValidator — validates Lumox fixture files / definitions against
 * both the JSON Schema (shape) and runtime semantics (registry lookups,
 * range coherence, address bounds, ...).
 *
 * Schema-only checks (the subset implemented here):
 *   - top-level `{version, definitions[]}` present
 *   - required fields on each definition / mode / channel / capability
 *   - field types and value bounds (0-255, etc.)
 *
 * Semantic checks the schema can't express:
 *   - `typeId` registered in ChannelTypeRegistry
 *   - capability `kind` registered in CapabilityRegistry
 *   - capability ranges non-overlapping within one channel (warning)
 *   - capability `min <= max`
 *   - channel count fits in 512-slot universe
 *   - ISO 8601 dates parseable
 *   - semver string parseable
 *   - 16-bit pair: coarse channel exists but fine missing (info)
 *
 * Result shape:
 *   { valid: bool, errors: [{path, message}], warnings: [{path, message}] }
 *
 * `valid` is true iff `errors.length === 0`. Warnings never block.
 *
 * Usage:
 *   const v = new FixtureValidator();
 *   const r = v.validate(json);                 // raw JSON file content
 *   const r = v.validateDefinition(def);        // FixtureDefinition instance or plain object
 */

/** A single validation finding: JSONPath-ish location + human message. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** Result returned by `validate` / `validateDefinition`. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Anything with a `toJSON()` — e.g. a `FixtureDefinition` instance. */
interface HasToJSON {
  toJSON(): unknown;
}

export class FixtureValidator {
  errors!: ValidationIssue[];
  warnings!: ValidationIssue[];

  constructor() {
    this._reset();
  }

  _reset(): void {
    this.errors = [];
    this.warnings = [];
  }

  err(path: string, message: string): void { this.errors.push({ path, message }); }
  warn(path: string, message: string): void { this.warnings.push({ path, message }); }

  /** Validate full file object: `{version, definitions: [...]}`. */
  validate(input: unknown): ValidationResult {
    this._reset();
    if (input == null || typeof input !== 'object') {
      this.err('$', 'file root must be an object');
      return this._result();
    }
    const root = input as Record<string, unknown>;
    if (root.version !== 1) {
      this.err('$.version', `expected 1, got ${JSON.stringify(root.version)}`);
    }
    if (!Array.isArray(root.definitions)) {
      this.err('$.definitions', 'must be an array');
      return this._result();
    }
    if (root.definitions.length === 0) {
      this.err('$.definitions', 'must contain at least one definition');
    }
    root.definitions.forEach((d, i) =>
      this._validateDefinition(d, `$.definitions[${i}]`));
    return this._result();
  }

  /** Validate one FixtureDefinition (plain JSON or class instance). */
  validateDefinition(def: unknown): ValidationResult {
    this._reset();
    const hasToJSON = def != null && typeof (def as HasToJSON).toJSON === 'function';
    this._validateDefinition(hasToJSON ? (def as HasToJSON).toJSON() : def, '$');
    return this._result();
  }

  _result(): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  // ---- helpers --------------------------------------------------------
  _validateDefinition(d: unknown, p: string): void {
    if (!isObject(d)) { this.err(p, 'must be object'); return; }

    requireString(this, d, 'manufacturer', `${p}.manufacturer`);
    requireString(this, d, 'model',        `${p}.model`);

    if ('id' in d && typeof d.id !== 'string') this.err(`${p}.id`, 'must be string');
    if ('type' in d && typeof d.type !== 'string') this.err(`${p}.type`, 'must be string');

    if ('meta' in d && d.meta != null) this._validateMeta(d.meta, `${p}.meta`);
    if ('physical' in d && d.physical != null) this._validatePhysical(d.physical, `${p}.physical`);

    if (!Array.isArray(d.modes)) {
      this.err(`${p}.modes`, 'must be array');
      return;
    }
    if (d.modes.length === 0) this.err(`${p}.modes`, 'must contain at least one mode');

    const seenIds = new Set<string>();
    d.modes.forEach((m, i) => {
      const path = `${p}.modes[${i}]`;
      this._validateMode(m, path);
      if (isObject(m) && typeof m.id === 'string') {
        if (seenIds.has(m.id)) this.err(`${path}.id`, `duplicate mode id "${m.id}"`);
        seenIds.add(m.id);
      }
    });
  }

  _validateMeta(meta: unknown, p: string): void {
    if (!isObject(meta)) { this.err(p, 'must be object'); return; }
    for (const k of ['author', 'version', 'createdAt', 'modifiedAt', 'source', 'notes']) {
      if (k in meta && meta[k] != null && typeof meta[k] !== 'string') {
        this.err(`${p}.${k}`, 'must be string or null');
      }
    }
    if (typeof meta.version === 'string' && !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(meta.version)) {
      this.warn(`${p}.version`, `not a valid semver: "${meta.version}"`);
    }
    for (const k of ['createdAt', 'modifiedAt']) {
      const v = meta[k];
      if (typeof v === 'string' && Number.isNaN(Date.parse(v))) {
        this.warn(`${p}.${k}`, `not a parseable ISO 8601 date: "${v}"`);
      }
    }
  }

  _validatePhysical(phys: unknown, p: string): void {
    if (!isObject(phys)) { this.err(p, 'must be object'); return; }

    const dims = phys.dimensions;
    if (dims != null) {
      if (!isObject(dims)) this.err(`${p}.dimensions`, 'must be object or null');
      else {
        for (const k of ['width', 'height', 'depth']) {
          if (k in dims && dims[k] != null && (typeof dims[k] !== 'number' || (dims[k] as number) < 0)) {
            this.err(`${p}.dimensions.${k}`, 'must be non-negative number');
          }
        }
        if ('unit' in dims && !['mm', 'cm'].includes(dims.unit as string)) {
          this.warn(`${p}.dimensions.unit`, `expected "mm" or "cm", got "${dims.unit}"`);
        }
      }
    }

    if (phys.weight != null) {
      if (!isObject(phys.weight)) this.err(`${p}.weight`, 'must be object or null');
      else {
        if ('value' in phys.weight && (typeof phys.weight.value !== 'number' || phys.weight.value < 0)) {
          this.err(`${p}.weight.value`, 'must be non-negative number');
        }
        if ('unit' in phys.weight && !['kg', 'g'].includes(phys.weight.unit as string)) {
          this.warn(`${p}.weight.unit`, `expected "kg" or "g", got "${phys.weight.unit}"`);
        }
      }
    }

    if (phys.power != null && isObject(phys.power)) {
      if ('consumption' in phys.power && (typeof phys.power.consumption !== 'number' || phys.power.consumption < 0)) {
        this.err(`${p}.power.consumption`, 'must be non-negative number');
      }
    }
  }

  _validateMode(m: unknown, p: string): void {
    if (!isObject(m)) { this.err(p, 'must be object'); return; }
    requireString(this, m, 'name', `${p}.name`);
    if ('id' in m && typeof m.id !== 'string') this.err(`${p}.id`, 'must be string');

    if (!Array.isArray(m.channels)) { this.err(`${p}.channels`, 'must be array'); return; }
    if (m.channels.length === 0) this.err(`${p}.channels`, 'must contain at least one channel');
    if (m.channels.length > 512) this.err(`${p}.channels`, `exceeds 512-channel universe (got ${m.channels.length})`);

    // Track types + indices for cross-channel checks
    const typeIndex = new Map<string, number>();   // typeId → first index where seen
    m.channels.forEach((c, i) => {
      const cp = `${p}.channels[${i}]`;
      if (c == null) return; // null slot OK
      this._validateChannel(c, cp);
      if (isObject(c) && typeof c.typeId === 'string') {
        if (!typeIndex.has(c.typeId)) typeIndex.set(c.typeId, i);
      }
    });

    // 16-bit pair check — fine channel present but coarse counterpart missing.
    // (Opposite case — coarse without fine — is normal and not flagged.)
    for (const tid of typeIndex.keys()) {
      const t = ChannelTypeRegistry.get(tid);
      if (!t?.fineOf) continue;
      if (!typeIndex.has(t.fineOf)) {
        this.warn(`${p}.channels[${typeIndex.get(tid)}]`,
          `fine channel "${tid}" present without coarse counterpart "${t.fineOf}"`);
      }
    }
  }

  _validateChannel(c: unknown, p: string): void {
    if (!isObject(c)) { this.err(p, 'must be object'); return; }
    requireString(this, c, 'typeId', `${p}.typeId`);

    if (typeof c.typeId === 'string') {
      if (!/^[a-z][a-z0-9-]*$/.test(c.typeId)) {
        this.err(`${p}.typeId`, `must be kebab-case ASCII, got "${c.typeId}"`);
      }
      if (!ChannelTypeRegistry.has(c.typeId)) {
        this.err(`${p}.typeId`, `unknown ChannelType: "${c.typeId}" (register via ChannelTypeRegistry.register)`);
      }
    }

    if ('defaultValue' in c) {
      const v = c.defaultValue;
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 255) {
        this.err(`${p}.defaultValue`, `must be integer 0-255, got ${JSON.stringify(v)}`);
      }
    }

    if ('capabilities' in c) {
      if (!Array.isArray(c.capabilities)) {
        this.err(`${p}.capabilities`, 'must be array');
      } else {
        const ranges: { min: number; max: number; idx: number }[] = [];
        c.capabilities.forEach((cap, i) => {
          const cp = `${p}.capabilities[${i}]`;
          this._validateCapability(cap, cp);
          if (isObject(cap) && Number.isInteger(cap.min) && Number.isInteger(cap.max) && (cap.min as number) <= (cap.max as number)) {
            ranges.push({ min: cap.min as number, max: cap.max as number, idx: i });
          }
        });
        // Overlap check
        for (let i = 0; i < ranges.length; i++) {
          for (let j = i + 1; j < ranges.length; j++) {
            const a = ranges[i], b = ranges[j];
            if (a.min <= b.max && b.min <= a.max) {
              this.warn(`${p}.capabilities`,
                `range overlap between [${a.min}-${a.max}] (idx ${a.idx}) and [${b.min}-${b.max}] (idx ${b.idx})`);
            }
          }
        }
      }
    }
  }

  _validateCapability(cap: unknown, p: string): void {
    if (!isObject(cap)) { this.err(p, 'must be object'); return; }
    requireString(this, cap, 'kind', `${p}.kind`);

    if (typeof cap.kind === 'string' && !CapabilityRegistry.get(cap.kind)) {
      this.err(`${p}.kind`, `unknown capability kind: "${cap.kind}" (register via CapabilityRegistry.register)`);
    }

    for (const k of ['min', 'max']) {
      if (!Number.isInteger(cap[k])) {
        this.err(`${p}.${k}`, `must be integer 0-255, got ${JSON.stringify(cap[k])}`);
      } else if ((cap[k] as number) < 0 || (cap[k] as number) > 255) {
        this.err(`${p}.${k}`, `out of range 0-255: ${cap[k]}`);
      }
    }

    if (Number.isInteger(cap.min) && Number.isInteger(cap.max) && (cap.min as number) > (cap.max as number)) {
      this.err(p, `min (${cap.min}) > max (${cap.max})`);
    }

    if ('label' in cap && cap.label != null && typeof cap.label !== 'string') {
      this.err(`${p}.label`, 'must be string');
    }

    // Kind-specific shape
    if (cap.kind === 'color' && 'color' in cap && typeof cap.color === 'string') {
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cap.color)) {
        this.warn(`${p}.color`, `not a #rgb / #rrggbb hex string: "${cap.color}"`);
      }
    }
    if (cap.kind === 'gobo' && 'pattern' in cap && cap.pattern != null && typeof cap.pattern !== 'string') {
      this.err(`${p}.pattern`, 'must be string or null');
    }
    if (cap.kind === 'shutter' && 'mode' in cap && cap.mode != null) {
      if (!['open', 'closed', 'strobe', 'pulse', 'random'].includes(cap.mode as string)) {
        this.warn(`${p}.mode`, `unexpected shutter mode: "${cap.mode}"`);
      }
    }
  }
}

// ---- tiny helpers -------------------------------------------------------
function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function requireString(self: FixtureValidator, obj: Record<string, unknown>, key: string, path: string): void {
  if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
    self.err(path, `required string field "${key}" missing or empty`);
  }
}
