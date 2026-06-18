import type { Patch } from './Patch';
import type { Fixture } from '../fixtures/Fixture';
import type { UniverseManager } from '../core/UniverseManager';

/** A fixture reference: either an id string or an object with an `id`. */
type FixtureRef = string | { id?: string } | null | undefined;

export interface GroupOptions {
  id?: string;
  name?: string;
  color?: string;
  fixtureIds?: Iterable<string>;
  configKey?: string | null;
}

export interface GroupJSON {
  id: string;
  name: string;
  color: string;
  fixtureIds: string[];
}

/**
 * Group — named collection of fixtures, addressed by id. Enables batch
 * commands ("set all dimmers to 50%") and gives fixture-aware effects
 * a target set.
 *
 *   id           string
 *   name         string
 *   color        hex string (UI hint; ignored by engine)
 *   fixtureIds   Set<string>  — references into a Patch
 *
 * Membership is by id, not by reference — groups outlive fixture
 * re-creation, and serialize cleanly. Resolve to live Fixture instances
 * via `group.fixtures(patch)`.
 *
 * Batch ops all take a Patch reference. They write to each fixture's
 * `values` buffer; you still need `patch.applyAll(universes)` to flush
 * to programmer buffers — or call `group.apply(patch, universes)`.
 */
export class Group {
  id: string;
  name: string;
  color: string;
  fixtureIds: Set<string>;
  /** UI hint — channel-config identity used to gate group membership. */
  configKey?: string | null;

  constructor({ id, name, color = '#888888', fixtureIds = [], configKey = null }: GroupOptions = {}) {
    this.id = id ?? `grp_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name ?? this.id;
    this.color = color;
    this.fixtureIds = new Set(fixtureIds);
    this.configKey = configKey;
  }

  get size(): number { return this.fixtureIds.size; }
  list(): string[] { return [...this.fixtureIds]; }

  add(fx: FixtureRef): this {
    const id = typeof fx === 'string' ? fx : fx?.id;
    if (id) this.fixtureIds.add(id);
    return this;
  }

  remove(fx: FixtureRef): this {
    const id = typeof fx === 'string' ? fx : fx?.id;
    if (id) this.fixtureIds.delete(id);
    return this;
  }

  has(fx: FixtureRef): boolean {
    const id = typeof fx === 'string' ? fx : fx?.id;
    return this.fixtureIds.has(id as string);
  }

  toggle(fx: FixtureRef): this {
    return this.has(fx) ? this.remove(fx) : this.add(fx);
  }

  clear(): this { this.fixtureIds.clear(); return this; }

  /** Resolve fixture ids to live Fixture instances via patch. Skips missing. */
  fixtures(patch: Patch): Fixture[] {
    const out: Fixture[] = [];
    for (const id of this.fixtureIds) {
      const fx = patch.get(id);
      if (fx) out.push(fx);
    }
    return out;
  }

  // ---- batch ops ------------------------------------------------------
  /** Set a channel by type id on every member fixture that has it. */
  set(patch: Patch, typeId: string, value: number): this {
    for (const fx of this.fixtures(patch)) fx.set(typeId, value);
    return this;
  }

  setIntensity(patch: Patch, v: number): this { return this.set(patch, 'intensity', v); }

  setRGB(patch: Patch, r: number, g: number, b: number): this {
    for (const fx of this.fixtures(patch)) fx.setRGB(r, g, b);
    return this;
  }

  setRGBW(patch: Patch, r: number, g: number, b: number, w: number): this {
    for (const fx of this.fixtures(patch)) fx.setRGBW(r, g, b, w);
    return this;
  }

  setPanTilt(patch: Patch, pan16: number, tilt16: number): this {
    for (const fx of this.fixtures(patch)) fx.setPanTilt(pan16, tilt16);
    return this;
  }

  /** Flush every member to programmer buffers of their universes. */
  apply(patch: Patch, universeManager: UniverseManager): this {
    for (const fx of this.fixtures(patch)) {
      const u = universeManager.get(fx.universeId);
      if (u) fx.apply(u);
    }
    return this;
  }

  /** Map members to all 1-based DMX addresses they own, keyed by universe. */
  channelAddresses(patch: Patch): Map<unknown, number[]> {
    const out = new Map<unknown, number[]>();
    for (const fx of this.fixtures(patch)) {
      let list = out.get(fx.universeId);
      if (!list) { list = []; out.set(fx.universeId, list); }
      for (let i = 0; i < fx.channelCount; i++) list.push(fx.startAddress + i);
    }
    return out;
  }

  toJSON(): GroupJSON {
    return {
      id: this.id, name: this.name, color: this.color,
      fixtureIds: [...this.fixtureIds],
    };
  }

  static fromJSON(obj: GroupOptions): Group { return new Group(obj); }
}
