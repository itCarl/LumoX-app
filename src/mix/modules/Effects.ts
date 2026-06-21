import { MixModule, blendHTP } from '../MixModule';
import type { MixModuleConfig, MixContext } from '../MixModule';
import { TOTAL_CHANNELS } from '../../core/Universe';
import type { Universe } from '../../core/Universe';

/**
 * Generator effect contract consumed by the Effects host.
 */
export interface Effect {
  id: string;
  name: string;
  opacity: number;
  enabled: boolean;
  /** which universes it affects */
  universeIds?: number[];
  /** writes 512 bytes into `target` */
  render(universe: Universe, ctx: MixContext, target: Uint8Array): void;
}

/**
 * Effects — host for generator effects (rainbow, sine sweep, strobe, chase).
 * Each effect implements `render(universe, ctx, target)` writing into a
 * private Uint8Array(512), then host HTP-merges into `universe.data` at
 * the effect's opacity.
 *
 * Effect contract:
 *   {
 *     id, name, opacity (0..1), enabled,
 *     universeIds: number[]   // which universes it affects
 *     render(universe, ctx, target)   // writes 512 bytes into `target`
 *   }
 *
 * Built-in effect templates live in this file as small factories. Custom
 * effects = plain object matching the contract — register via `add(effect)`.
 */
export class Effects extends MixModule {
  effects: Map<string, Effect>;
  _scratch: Uint8Array;

  constructor(config: MixModuleConfig = {}) {
    super({ name: 'Effects', ...config });
    this.effects = new Map();
    this._scratch = new Uint8Array(TOTAL_CHANNELS);
  }

  add(effect: Effect): Effect { this.effects.set(effect.id, effect); return effect; }
  remove(id: string): void  { this.effects.delete(id); }
  get(id: string): Effect | undefined { return this.effects.get(id); }
  list(): Effect[]      { return [...this.effects.values()]; }

  process(universe: Universe, ctx: MixContext): void {
    for (const fx of this.effects.values()) {
      if (!fx.enabled || fx.opacity <= 0) continue;
      if (fx.universeIds && !fx.universeIds.includes(universe.id)) continue;
      this._scratch.fill(0);
      fx.render(universe, ctx, this._scratch);
      blendHTP(universe.data, this._scratch, fx.opacity);
    }
  }
}

// ---- built-in effect factories ------------------------------------------

export interface SineEffectOptions {
  id: string;
  channel?: number;
  periodMs?: number;
  min?: number;
  max?: number;
  opacity?: number;
  universeIds?: number[];
  name?: string;
}

/** Sine wave on a single channel. period in ms. */
export function sineEffect({
  id, channel = 1, periodMs = 2000, min = 0, max = 255,
  opacity = 1, universeIds, name = 'Sine',
}: SineEffectOptions): Effect {
  return {
    id, name, enabled: true, opacity, universeIds,
    render(_uni: Universe, ctx: MixContext, target: Uint8Array) {
      const phase = (ctx.now % periodMs) / periodMs;
      const v = ((Math.sin(phase * Math.PI * 2) * 0.5 + 0.5) * (max - min) + min) | 0;
      target[channel - 1] = v & 0xff;
    },
  };
}

export interface StrobeEffectOptions {
  id: string;
  channels?: number[];
  rateHz?: number;
  opacity?: number;
  universeIds?: number[];
  name?: string;
}

/** Strobe — square wave on channels. */
export function strobeEffect({
  id, channels = [1], rateHz = 10, opacity = 1, universeIds, name = 'Strobe',
}: StrobeEffectOptions): Effect {
  const halfPeriodMs = 500 / rateHz;
  return {
    id, name, enabled: true, opacity, universeIds,
    render(_uni: Universe, ctx: MixContext, target: Uint8Array) {
      const on = (ctx.now % (halfPeriodMs * 2)) < halfPeriodMs;
      const v = on ? 255 : 0;
      for (const ch of channels) target[ch - 1] = v;
    },
  };
}

export interface ChaseEffectOptions {
  id: string;
  steps?: number[][];
  stepMs?: number;
  opacity?: number;
  universeIds?: number[];
  name?: string;
}

/** Chase — step through channel groups at stepMs interval. */
export function chaseEffect({
  id, steps = [], stepMs = 250, opacity = 1, universeIds, name = 'Chase',
}: ChaseEffectOptions): Effect {
  return {
    id, name, enabled: true, opacity, universeIds,
    render(_uni: Universe, ctx: MixContext, target: Uint8Array) {
      if (steps.length === 0) return;
      const idx = Math.floor(ctx.now / stepMs) % steps.length;
      for (const ch of steps[idx]) target[ch - 1] = 255;
    },
  };
}
