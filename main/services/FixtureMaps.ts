// FixtureMaps — resolves each fixture's authoring data (output limits, virtual
// dimmers) into the absolute DMX addresses the engine's post-mix stages consume.
// The engine stays fixture-agnostic; this is the one place the patch is consulted
// for those maps. Rebuild after any patch or limits change.

import { engine, show } from '../context';
import type {
  Fixture, FixtureLimitTargets, AxisLimitTarget, LimitMap,
  VirtualDimmerMap, VirtualCluster,
} from '../../src/index';

// ---- virtual-dimmer seeding ---------------------------------------------

/** Seed every RGB-only fixture's virtual dimmers to full in their universe
 *  programmer, so colour shows at 100% by default. Idempotent. */
export function seedVirtualDimmers(): void {
  for (const f of show.patch.list()) {
    const u = engine.universes.get(f.universeId);
    if (u) f.applyVirtual(u);
  }
}

// ---- per-fixture output limits ------------------------------------------
// Resolve each fixture's authoring limits (`fx.limits`, in coarse DMX) to the
// absolute addresses the engine's Limits post-stage clamps/shapes.

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function axisTarget(fx: Fixture, attr: 'pan' | 'tilt', lim: { min: number; max: number; invert?: boolean }): AxisLimitTarget | undefined {
  const addr = fx.addressOf(attr);
  if (!addr) return undefined;
  const min = clampByte(lim.min), max = clampByte(lim.max);
  return { addr, fine: fx.fineAddressOf(attr), min: Math.min(min, max), max: Math.max(min, max), invert: !!lim.invert };
}

function buildLimitMap(): LimitMap {
  const map: LimitMap = new Map();
  for (const f of show.patch.list()) {
    const lim = f.limits;
    const e: FixtureLimitTargets = {};
    if (lim?.dimmer) { const addrs = f.intensityAddresses(); if (addrs.length) e.dimmer = { addrs, max: clampByte(lim.dimmer.max) }; }
    if (lim?.pan)  { const t = axisTarget(f, 'pan', lim.pan);   if (t) e.pan = t; }
    if (lim?.tilt) { const t = axisTarget(f, 'tilt', lim.tilt); if (t) e.tilt = t; }
    if (lim?.swapPanTilt) {
      const pan = f.addressOf('pan'), tilt = f.addressOf('tilt');
      if (pan && tilt) e.swap = { pan, panFine: f.fineAddressOf('pan'), tilt, tiltFine: f.fineAddressOf('tilt') };
    }
    if (e.dimmer || e.pan || e.tilt || e.swap) (map.get(f.universeId) ?? map.set(f.universeId, []).get(f.universeId)!).push(e);
  }
  return map;
}

/** Re-resolve every fixture's limits into the engine's Limits post-stage. */
export function rebuildLimits(): void {
  engine.limits.setMap(buildLimitMap());
}

// ---- per-fixture virtual dimmers ----------------------------------------
// RGB-only fixtures (colour mixing, no intensity channel) get one virtual dimmer
// per colour cluster, resolved here to the addresses the engine's VirtualDimmer
// post-stage scales. Topology-dependent, so rebuild on any patch change.

function buildVirtualDimmerMap(): VirtualDimmerMap {
  const map: VirtualDimmerMap = new Map();
  for (const f of show.patch.list()) {
    const vds = f.virtualDimmers();
    if (!vds.length) continue;
    const list = map.get(f.universeId) ?? map.set(f.universeId, []).get(f.universeId)!;
    for (const vd of vds) list.push(vd as VirtualCluster);
  }
  return map;
}

/** Re-resolve every RGB-only fixture's virtual dimmers into the engine's VirtualDimmer post-stage. */
export function rebuildVirtualDimmers(): void {
  engine.virtualDimmer.setMap(buildVirtualDimmerMap());
}

/** Re-resolve all per-fixture engine maps (limits + virtual dimmers) after a patch change. */
export function rebuildFixtureMaps(): void {
  rebuildLimits();
  rebuildVirtualDimmers();
}
