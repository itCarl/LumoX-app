import { MixModule } from '../MixModule';
import type { MixModuleConfig, MixContext } from '../MixModule';
import type { Universe } from '../../core/Universe';
import { hsvToBytes } from '../../util/color';

/**
 * Minimal structural type for a patched fixture, as consumed here.
 * (Full definition lives in `src/show/` / `src/fixtures/`.)
 */
export interface FixtureLike {
  id: string;
  universeId: number;
  startAddress: number;
  mode: { indexOfType(typeId: string): number | undefined };
}

/**
 * Minimal structural type for a Group, as consumed here.
 */
export interface GroupLike {
  size: number;
  fixtures(patch: unknown): FixtureLike[];
  list(): string[];
}

/** Writer helper passed to a group effect's render(). */
export type GroupWrite = (typeId: string, value: number) => void;

/**
 * Fixture-aware effect contract consumed by the GroupEffects host.
 */
export interface GroupEffect {
  id: string;
  name: string;
  opacity: number;
  enabled: boolean;
  group: GroupLike | null;
  render(
    fixture: FixtureLike,
    ctx: MixContext,
    write: GroupWrite,
    indexInGroup: number,
    groupSize: number,
  ): void;
}

export interface GroupEffectsConfig extends MixModuleConfig {
  patch?: unknown;
}

/**
 * GroupEffects — fixture-aware effect host.
 *
 * Unlike `Effects` (which writes raw channel bytes), GroupEffects targets
 * a `Group` of fixtures and lets effects render in fixture semantics —
 * write `'intensity'`, `'red'`, etc. by type id. Address resolution +
 * HTP blend + opacity scaling happen in the host.
 *
 * Wire up a Patch reference once (engine.groupEffects.bindPatch(patch))
 * — without it this module is a no-op.
 *
 * Effect contract:
 *   {
 *     id, name, opacity (0..1), enabled,
 *     group,                                Group instance
 *     render(fixture, ctx, write, indexInGroup, groupSize)
 *   }
 * Where `write(typeId, value)` is the helper provided by this host — it
 * resolves address via fixture.mode, applies opacity, HTP-blends into
 * universe.data.
 *
 * Built-in factories below: rainbow, chase, flash, sineIntensity.
 */
export class GroupEffects extends MixModule {
  effects: Map<string, GroupEffect>;
  _patch: unknown;

  constructor(config: GroupEffectsConfig = {}) {
    super({ name: 'Group Effects', ...config });
    this.effects = new Map();
    this._patch = config.patch ?? null;
  }

  bindPatch(patch: unknown): void { this._patch = patch; }

  add(effect: GroupEffect): GroupEffect  { this.effects.set(effect.id, effect); return effect; }
  remove(id: string): void   { this.effects.delete(id); }
  get(id: string): GroupEffect | undefined { return this.effects.get(id); }
  list(): GroupEffect[]       { return [...this.effects.values()]; }

  process(universe: Universe, ctx: MixContext): void {
    if (!this._patch) return;
    for (const fx of this.effects.values()) {
      if (!fx.enabled || fx.opacity <= 0 || !fx.group) continue;

      const members = fx.group.fixtures(this._patch)
        .filter((f) => f.universeId === universe.id);
      if (members.length === 0) continue;

      const groupSize = fx.group.size;
      // Position within the full group (across universes), resolved once.
      const order = fx.group.list();
      const indexInGroup = new Map(order.map((id, i) => [id, i]));
      members.forEach((fixture) => {
        const idxInGroup = indexInGroup.get(fixture.id) ?? 0;
        const write: GroupWrite = (typeId, value) => {
          const slot = fixture.mode.indexOfType(typeId);
          if (!slot) return;
          const addr = fixture.startAddress + slot - 1;
          const i = addr - 1;
          if (i < 0 || i >= universe.data.length) return;
          const v = Math.max(0, Math.min(255, (value * fx.opacity) | 0));
          if (v > universe.data[i]) universe.data[i] = v;   // HTP
        };
        fx.render(fixture, ctx, write, idxInGroup, groupSize);
      });
    }
  }
}

// ---- built-in fixture-aware effects -----------------------------------

export interface RainbowGroupEffectOptions {
  id: string;
  group: GroupLike;
  periodMs?: number;
  spread?: number;
  saturation?: number;
  value?: number;
  alsoLightIntensity?: boolean;
  opacity?: number;
  name?: string;
}

/**
 * Rainbow across the group — hue offset per fixture so the group reads
 * like a color spread. `spread` = how many full hue rotations span the group.
 */
export function rainbowGroupEffect({
  id, group, periodMs = 4000, spread = 1.0, saturation = 1, value = 1,
  alsoLightIntensity = true, opacity = 1, name = 'Rainbow',
}: RainbowGroupEffectOptions): GroupEffect {
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture: FixtureLike, ctx: MixContext, write: GroupWrite, idx: number, count: number) {
      const base = (ctx.now % periodMs) / periodMs;
      const offset = count > 0 ? (idx / count) * spread : 0;
      const h = (base + offset) % 1;
      const { r, g, b } = hsvToBytes(h * 360, saturation, value);
      write('red', r); write('green', g); write('blue', b);
      if (alsoLightIntensity) write('intensity', 255);
    },
  };
}

export interface ChaseGroupEffectOptions {
  id: string;
  group: GroupLike;
  stepMs?: number;
  color?: [number, number, number] | number[];
  opacity?: number;
  name?: string;
}

/**
 * Chase — single fixture in the group lit at a time, walking forward.
 */
export function chaseGroupEffect({
  id, group, stepMs = 200, color = [255, 255, 255], opacity = 1,
  name = 'Chase',
}: ChaseGroupEffectOptions): GroupEffect {
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture: FixtureLike, ctx: MixContext, write: GroupWrite, idx: number, count: number) {
      if (count === 0) return;
      const active = Math.floor(ctx.now / stepMs) % count;
      if (idx !== active) return;
      write('intensity', 255);
      write('red',   color[0]);
      write('green', color[1]);
      write('blue',  color[2]);
    },
  };
}

export interface FlashGroupEffectOptions {
  id: string;
  group: GroupLike;
  rateHz?: number;
  opacity?: number;
  name?: string;
}

/**
 * Flash / strobe — all members pulse intensity at the same rate.
 */
export function flashGroupEffect({
  id, group, rateHz = 8, opacity = 1, name = 'Flash',
}: FlashGroupEffectOptions): GroupEffect {
  const halfPeriod = 500 / rateHz;
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture: FixtureLike, ctx: MixContext, write: GroupWrite) {
      const on = (ctx.now % (halfPeriod * 2)) < halfPeriod;
      write('intensity', on ? 255 : 0);
    },
  };
}

export interface SineIntensityGroupEffectOptions {
  id: string;
  group: GroupLike;
  periodMs?: number;
  phaseSpread?: number;
  min?: number;
  max?: number;
  opacity?: number;
  name?: string;
}

/**
 * Sine intensity wave with phase offset per fixture.
 */
export function sineIntensityGroupEffect({
  id, group, periodMs = 2000, phaseSpread = 1.0,
  min = 0, max = 255, opacity = 1, name = 'Sine Intensity',
}: SineIntensityGroupEffectOptions): GroupEffect {
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture: FixtureLike, ctx: MixContext, write: GroupWrite, idx: number, count: number) {
      const phase = (ctx.now % periodMs) / periodMs;
      const offset = count > 0 ? (idx / count) * phaseSpread : 0;
      const a = Math.sin((phase + offset) * Math.PI * 2);
      const v = (((a * 0.5 + 0.5) * (max - min)) + min) | 0;
      write('intensity', v);
    },
  };
}
