import { MixModule } from '../MixModule';
import type { MixContext } from '../MixModule';
import type { Universe } from '../../core/Universe';

/**
 * VirtualDimmer — a post-mix stage that gives RGB-only fixtures (colour mixing
 * but no intensity channel) a working dimmer by scaling each colour cluster's
 * final R/G/B(/W) output by a virtual intensity value.
 *
 * The virtual value lives in the universe's virtual channel region (an address
 * above the 512 wire channels), so it rides the whole mix/scene/fade/HTP/FX
 * pipeline exactly like a real dimmer and never reaches the wire. The engine
 * stays fixture-agnostic: the app resolves each fixture's clusters to absolute
 * addresses and hands over a per-universe {@link VirtualDimmerMap} via
 * {@link setMap} on patch change. This module only walks addresses.
 *
 * Runs after compositing (so it scales the final colour and reads the composited
 * virtual value) and before the masters (so Grand Master / Blackout scale the
 * already-dimmed colour once — the correct real-dimmer analogue).
 */

/** One colour cluster resolved to addresses: its virtual dimmer + RGB(W) outputs. */
export interface VirtualCluster { virtualAddr: number; r: number; g: number; b: number; w?: number; }
/** universeId → resolved virtual-dimmer clusters. */
export type VirtualDimmerMap = Map<number, VirtualCluster[]>;

export class VirtualDimmer extends MixModule {
  map: VirtualDimmerMap;

  constructor() {
    super({ name: 'Virtual Dimmer' });
    this.map = new Map();
  }

  /** Replace the resolved per-universe cluster map (app, on patch change). */
  setMap(map: VirtualDimmerMap): void { this.map = map; }

  process(universe: Universe, _ctx: MixContext): void {
    const clusters = this.map.get(universe.id);
    if (!clusters || !clusters.length) return;
    const d = universe.data;
    for (const c of clusters) {
      const vi = c.virtualAddr - 1;
      if (vi < 0 || vi >= d.length) continue;
      const v = d[vi];
      if (v >= 255) continue;                    // full — no scaling needed
      const f = v / 255;
      scale(d, c.r, f);
      scale(d, c.g, f);
      scale(d, c.b, f);
      if (c.w != null) scale(d, c.w, f);
    }
  }
}

/** Scale a single 1-based address in place by `f` (0..1). */
function scale(d: Uint8Array, addr: number, f: number): void {
  const i = addr - 1;
  if (i >= 0 && i < d.length) d[i] = (d[i] * f) | 0;
}
