import { MixModule } from '../MixModule';
import type { MixContext } from '../MixModule';
import type { Universe } from '../../core/Universe';

/**
 * Limits — a post-mix stage that clamps / shapes the final per-universe buffer
 * per fixture, so a fixture's physical limits hold regardless of which source
 * (scene / FX / live programmer) drove the channel.
 *
 * The engine stays fixture-agnostic: the app resolves each fixture's limits to
 * absolute DMX addresses and hands over a per-universe {@link LimitMap} via
 * {@link setMap} on patch / limits change. This module only walks addresses.
 *
 * Per fixture, applied in order: dimmer cap → pan/tilt range + invert (16-bit
 * aware) → swap (exchange the pan & tilt output bytes, so a shaped pan value is
 * routed to the tilt channel, matching a physical pan/tilt wiring swap).
 *
 * Pan/tilt is a **range remap**, not a clamp: the channel's full normalised input
 * (0..full) is linearly mapped into the `[min,max]` window. So a MOVE-FX sweep
 * fills the window smoothly with no clipping, the FX stays limit-agnostic (it
 * computes normalised motion), and changing a limit only re-maps — it never
 * rebuilds the FX. Dimmer is a true ceiling clamp (brightness isn't rescaled).
 */

/** A pan or tilt axis, resolved to addresses. `fine` 0 = 8-bit only. min/max coarse 0..255. */
export interface AxisLimitTarget { addr: number; fine: number; min: number; max: number; invert: boolean; }
/** One fixture's limits, resolved to absolute DMX addresses on its universe. */
export interface FixtureLimitTargets {
  dimmer?: { addrs: number[]; max: number };
  pan?: AxisLimitTarget;
  tilt?: AxisLimitTarget;
  swap?: { pan: number; panFine: number; tilt: number; tiltFine: number };
  /** follows-dimmer: scale each `addr` by the mixed dimmer at `dim` (÷255). */
  follows?: { addrs: number[]; dim: number };
}
/** universeId → resolved per-fixture limit targets. */
export type LimitMap = Map<number, FixtureLimitTargets[]>;

/** Linearly remap one axis's normalised input into [min,max], 16-bit aware. */
function applyAxis(d: Uint8Array, ax: AxisLimitTarget): void {
  const ci = ax.addr - 1;
  if (ci < 0 || ci >= d.length) return;
  const fi = ax.fine ? ax.fine - 1 : -1;
  if (fi >= 0 && fi < d.length) {
    let norm = ((d[ci] << 8) | d[fi]) / 65535;   // 0..1 over the full 16-bit range
    if (ax.invert) norm = 1 - norm;
    const lo = ax.min * 257, hi = ax.max * 257;  // ×257 maps 0..255 → 0..65535
    const out = Math.round(lo + norm * (hi - lo));
    d[ci] = (out >> 8) & 0xff;
    d[fi] = out & 0xff;
  } else {
    let norm = d[ci] / 255;
    if (ax.invert) norm = 1 - norm;
    d[ci] = Math.round(ax.min + norm * (ax.max - ax.min)) & 0xff;
  }
}

function swapBytes(d: Uint8Array, a: number, b: number): void {
  const ia = a - 1, ib = b - 1;
  if (ia < 0 || ib < 0 || ia >= d.length || ib >= d.length) return;
  const t = d[ia]; d[ia] = d[ib]; d[ib] = t;
}

export class Limits extends MixModule {
  map: LimitMap;

  constructor() {
    super({ name: 'Limits' });
    this.map = new Map();
  }

  /** Replace the resolved per-universe limit map (app, on patch / limits change). */
  setMap(map: LimitMap): void { this.map = map; }

  process(universe: Universe, _ctx: MixContext): void {
    const entries = this.map.get(universe.id);
    if (!entries || !entries.length) return;
    const d = universe.data;
    for (const e of entries) {
      if (e.dimmer) {
        const max = e.dimmer.max;
        for (const a of e.dimmer.addrs) { const i = a - 1; if (i >= 0 && i < d.length && d[i] > max) d[i] = max; }
      }
      if (e.pan) applyAxis(d, e.pan);
      if (e.tilt) applyAxis(d, e.tilt);
      if (e.swap) {
        swapBytes(d, e.swap.pan, e.swap.tilt);
        if (e.swap.panFine && e.swap.tiltFine) swapBytes(d, e.swap.panFine, e.swap.tiltFine);
      }
      if (e.follows) {
        const di = e.follows.dim - 1;
        const scale = di >= 0 && di < d.length ? d[di] / 255 : 1;
        for (const a of e.follows.addrs) { const i = a - 1; if (i >= 0 && i < d.length) d[i] = (d[i] * scale) | 0; }
      }
    }
  }
}
