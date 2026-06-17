import { MixModule } from '../MixModule.js';

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
  constructor(config = {}) {
    super({ name: 'Group Effects', ...config });
    this.effects = new Map();
    this._patch = config.patch ?? null;
  }

  bindPatch(patch) { this._patch = patch; }

  add(effect)  { this.effects.set(effect.id, effect); return effect; }
  remove(id)   { this.effects.delete(id); }
  get(id)      { return this.effects.get(id); }
  list()       { return [...this.effects.values()]; }

  process(universe, ctx) {
    if (!this._patch) return;
    for (const fx of this.effects.values()) {
      if (!fx.enabled || fx.opacity <= 0 || !fx.group) continue;

      const members = fx.group.fixtures(this._patch)
        .filter((f) => f.universeId === universe.id);
      if (members.length === 0) continue;

      const groupSize = fx.group.size;
      members.forEach((fixture, idxLocal) => {
        // idxInGroup is the position within the full group (across universes)
        const idxInGroup = fx.group.list().indexOf(fixture.id);
        const write = (typeId, value) => {
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

// ---- HSV → RGB --------------------------------------------------------
function hsvToRgb(h, s = 1, v = 1) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [(r * 255) | 0, (g * 255) | 0, (b * 255) | 0];
}

// ---- built-in fixture-aware effects -----------------------------------

/**
 * Rainbow across the group — hue offset per fixture so the group reads
 * like a color spread. `spread` = how many full hue rotations span the group.
 */
export function rainbowGroupEffect({
  id, group, periodMs = 4000, spread = 1.0, saturation = 1, value = 1,
  alsoLightIntensity = true, opacity = 1, name = 'Rainbow',
}) {
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture, ctx, write, idx, count) {
      const base = (ctx.now % periodMs) / periodMs;
      const offset = count > 0 ? (idx / count) * spread : 0;
      const h = (base + offset) % 1;
      const [r, g, b] = hsvToRgb(h, saturation, value);
      write('red', r); write('green', g); write('blue', b);
      if (alsoLightIntensity) write('intensity', 255);
    },
  };
}

/**
 * Chase — single fixture in the group lit at a time, walking forward.
 */
export function chaseGroupEffect({
  id, group, stepMs = 200, color = [255, 255, 255], opacity = 1,
  name = 'Chase',
}) {
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture, ctx, write, idx, count) {
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

/**
 * Flash / strobe — all members pulse intensity at the same rate.
 */
export function flashGroupEffect({
  id, group, rateHz = 8, opacity = 1, name = 'Flash',
}) {
  const halfPeriod = 500 / rateHz;
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture, ctx, write) {
      const on = (ctx.now % (halfPeriod * 2)) < halfPeriod;
      write('intensity', on ? 255 : 0);
    },
  };
}

/**
 * Sine intensity wave with phase offset per fixture.
 */
export function sineIntensityGroupEffect({
  id, group, periodMs = 2000, phaseSpread = 1.0,
  min = 0, max = 255, opacity = 1, name = 'Sine Intensity',
}) {
  return {
    id, name, enabled: true, opacity, group,
    render(_fixture, ctx, write, idx, count) {
      const phase = (ctx.now % periodMs) / periodMs;
      const offset = count > 0 ? (idx / count) * phaseSpread : 0;
      const a = Math.sin((phase + offset) * Math.PI * 2);
      const v = (((a * 0.5 + 0.5) * (max - min)) + min) | 0;
      write('intensity', v);
    },
  };
}
