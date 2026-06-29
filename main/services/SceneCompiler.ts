// SceneCompiler — translates a Scene from the show model into a SceneMixer track,
// attaching each FX layer's patch-derived DMX target addresses (resolved from the
// layer's group + sweep order). The engine stays fixture-agnostic; this is the one
// place the patch is consulted to turn fixture-relative effects into absolute
// addresses. Use everywhere a track is (re)created so layers always carry their
// current targets.

import { show } from '../context';
import { getSelection } from './SelectionService';
import { TOTAL_CHANNELS } from '../../src/index';
import type { Scene } from '../../src/index';
import type { Fixture, FxTargetSel, FxOrder, FxKind, FxFeature, Vec2 } from '../../src/index';
import type { MixerTrack } from '../../src/show/Scene';

/** Fixtures an FX layer targets — the rig (patch order), a group (membership
 *  order), or the live programmer selection (selection order). */
function fixturesFor(sel: FxTargetSel): Fixture[] {
  if (sel.mode === 'group') {
    const g = show.groups.list().find((x) => x.id === sel.groupId);
    return g ? g.fixtures(show.patch) : [];
  }
  if (sel.mode === 'selection') {
    return getSelection().map((id) => show.patch.get(id)).filter((f): f is Fixture => !!f);
  }
  return show.patch.list();
}

/** Deterministic 0..1 from an index (stable shuffle for FxOrder 'random'). */
const orderHash = (i: number): number => { const s = Math.sin((i + 1) * 127.1) * 43758.5453; return s - Math.floor(s); };

/** A fixture's centroid on the stage (average of its emitter world positions),
 *  used by the 2D sweep orders. Falls back to its transform origin. */
function fixtureCentroid(f: Fixture): Vec2 {
  const ws = f.emitterWorldPositions();
  if (!ws.length) return { x: f.stageTransform.x, y: f.stageTransform.y };
  let x = 0, y = 0;
  for (const p of ws) { x += p.x; y += p.y; }
  return { x: x / ws.length, y: y / ws.length };
}

/** Reorder fixtures to realise an FX sweep order (the per-fixture "index").
 *  `row`/`column`/`diagonal` are 2D, matrix-aware orders: fixtures sweep by
 *  their stage position so an effect fans across a grid in that direction. The
 *  primary axis is quantised to a stage unit so near-aligned fixtures share a
 *  row/column despite small position jitter. */
function orderFixtures(fxs: Fixture[], order: FxOrder): Fixture[] {
  const n = fxs.length;
  if (n <= 1 || order === 'patch') return fxs;
  const idx = fxs.map((_, i) => i);
  if (order === 'reverse') idx.reverse();
  else if (order === 'mirror') { const c = (n - 1) / 2; idx.sort((a, b) => Math.abs(a - c) - Math.abs(b - c)); }   // centre-out
  else if (order === 'random') idx.sort((a, b) => orderHash(a) - orderHash(b));
  else if (order === 'row' || order === 'column' || order === 'diagonal') {
    const c = fxs.map(fixtureCentroid);
    const q = Math.round;
    // [primary, secondary] sort key per fixture for the chosen direction.
    const key = (i: number): [number, number] =>
      order === 'row' ? [q(c[i].y), c[i].x]            // top→bottom, then left→right
        : order === 'column' ? [q(c[i].x), c[i].y]     // left→right, then top→bottom
          : [q(c[i].x + c[i].y), c[i].x];              // diagonal (TL→BR)
    idx.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
  }
  return idx.map((i) => fxs[i]);
}

/** Resolve a fixture's address for an attribute (intensity falls back to the
 *  master dimmer), or 0 when the fixture lacks it. */
function attrAddr(f: Fixture, attr: string): number {
  return f.addressOf(attr) || (attr === 'intensity' ? f.addressOf('intensity-master') : 0);
}

/** Per-universe DMX target addresses for a layer kind, over `fxs` (in order),
 *  plus the fixture id behind each target tuple (index-aligned with `targets`,
 *  per universe) so the UI can label each preview beam with its fixture.
 *
 *  COLOR → `[r,g,b]`, MOVE → `[pan,tilt]`. CURVE / VALUE / CHASER drive a LIST of
 *  armed `features`: each beam's tuple is one address per feature (aligned to
 *  `features`, `0` where the fixture lacks that attr → the renderer skips it). */
function targetsForKind(kind: FxKind, features: FxFeature[], fxs: Fixture[]): { targets: Record<number, number[][]>; ids: Record<number, string[]> } {
  const targets: Record<number, number[][]> = {};
  const ids: Record<number, string[]> = {};
  const push = (f: Fixture, tuple: number[]): void => {
    (targets[f.universeId] ??= []).push(tuple);
    (ids[f.universeId] ??= []).push(f.id);
  };
  for (const f of fxs) {
    if (kind === 'color') {
      const r = f.addressOf('red'), g = f.addressOf('green'), b = f.addressOf('blue');
      if (r && g && b) push(f, [r, g, b]);
    } else if (kind === 'move') {
      const pan = f.addressOf('pan'), tilt = f.addressOf('tilt');
      if (pan && tilt) push(f, [pan, tilt]);
    } else if (features.length === 1 && features[0].attr === 'intensity' && !attrAddr(f, 'intensity') && f.needsVirtualDimmer()) {
      // a lone intensity feature on an RGB-only fixture fans across its virtual
      // dimmers (one beam per colour cluster) — preserves the single-attr bar behaviour
      for (const vd of f.virtualDimmers()) push(f, [vd.virtualAddr]);
    } else {
      // one address per armed feature, aligned to `features`
      const tuple = features.map((ft) => attrAddr(f, ft.attr));
      if (tuple.some((a) => a > 0)) push(f, tuple);
    }
  }
  return { targets, ids };
}

/**
 * MATRIX FX targets — one `[r,g,b(,w)]` tuple per *emitter* (true pixel-map),
 * paired with that emitter's 2D world position. A single-colour fixture
 * contributes one cell (the whole fixture as a pixel); a matrix contributes one
 * per emitter. `targets` + `positions` are index-aligned per universe.
 */
function matrixTargets(fxs: Fixture[]): { targets: Record<number, number[][]>; positions: Record<number, Vec2[]>; ids: Record<number, string[]> } {
  const targets: Record<number, number[][]> = {};
  const positions: Record<number, Vec2[]> = {};
  const ids: Record<number, string[]> = {};
  for (const f of fxs) {
    const cells = f.emitterColorAddresses();
    if (!cells.length) continue;
    const worlds = f.emitterWorldPositions();
    const m = Math.min(cells.length, worlds.length);
    const t = (targets[f.universeId] ??= []);
    const p = (positions[f.universeId] ??= []);
    const d = (ids[f.universeId] ??= []);
    for (let k = 0; k < m; k++) {
      const c = cells[k];
      t.push(c.w != null ? [c.r, c.g, c.b, c.w] : [c.r, c.g, c.b]);
      p.push(worlds[k]);
      d.push(f.id);
    }
  }
  return { targets, positions, ids };
}

/**
 * Build a scene's SceneMixer track, attaching each FX layer's patch-derived DMX
 * target addresses (resolved from the layer's group + sweep order).
 */
export function sceneTrack(scene: Scene, opacity = 0): MixerTrack {
  const track = scene.toMixerTrack({ blend: 'htp', opacity });
  if (track.layers) {
    const setMask = (track.setMask ??= {});
    scene.layers.forEach((L, i) => {
      const tl = track.layers![i];
      if (!tl) return;
      const fxs = orderFixtures(fixturesFor(L.target), L.order);
      if (L.kind === 'matrix') {
        const { targets, positions, ids } = matrixTargets(fxs);
        tl.targets = targets;
        tl.positions = positions;
        tl.beamIds = ids;
      } else {
        const features = L.curve?.features ?? L.value?.features ?? L.chaser?.features ?? [];
        const { targets, ids } = targetsForKind(L.kind, features, fxs);
        tl.targets = targets;
        tl.beamIds = ids;
      }
      // An enabled layer drives its target addresses — fold them into the
      // scene's footprint so the SceneMixer LTP-applies them (even at value 0).
      if (tl.enabled) markTargets(setMask, tl.targets);
    });
  }
  return track;
}

/** Flag every target address (per universe) in the footprint mask. */
function markTargets(setMask: Record<number, Uint8Array>, targets?: Record<number, number[][]>): void {
  if (!targets) return;
  for (const [uniId, tuples] of Object.entries(targets)) {
    let buf = setMask[+uniId];
    if (!buf) { buf = new Uint8Array(TOTAL_CHANNELS); setMask[+uniId] = buf; }
    for (const tuple of tuples) for (const addr of tuple) if (addr >= 1 && addr <= buf.length) buf[addr - 1] = 1;
  }
}
