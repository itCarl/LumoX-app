// SceneCompiler — translates a Scene from the show model into a SceneMixer track,
// attaching each FX layer's patch-derived DMX target addresses (resolved from the
// layer's group + sweep order). The engine stays fixture-agnostic; this is the one
// place the patch is consulted to turn fixture-relative effects into absolute
// addresses. Use everywhere a track is (re)created so layers always carry their
// current targets.

import { show } from '../context';
import { getSelection } from './SelectionService';
import type { Scene } from '../../src/index';
import type { Fixture, FxTargetSel, FxOrder, FxKind, Vec2 } from '../../src/index';
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

/** Reorder fixtures to realise an FX sweep order (the per-fixture "index"). */
function orderFixtures(fxs: Fixture[], order: FxOrder): Fixture[] {
  const n = fxs.length;
  if (n <= 1 || order === 'patch') return fxs;
  const idx = fxs.map((_, i) => i);
  if (order === 'reverse') idx.reverse();
  else if (order === 'mirror') { const c = (n - 1) / 2; idx.sort((a, b) => Math.abs(a - c) - Math.abs(b - c)); }   // centre-out
  else if (order === 'random') idx.sort((a, b) => orderHash(a) - orderHash(b));
  return idx.map((i) => fxs[i]);
}

/** Per-universe DMX target addresses for a layer kind, over `fxs` (in order),
 *  plus the fixture id behind each target tuple (index-aligned with `targets`,
 *  per universe) so the UI can label each preview beam with its fixture. */
function targetsForKind(kind: FxKind, attr: string, fxs: Fixture[]): { targets: Record<number, number[][]>; ids: Record<number, string[]> } {
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
    } else {
      // curve / value / chaser → one attribute address. Intensity falls back to
      // the master dimmer, then (RGB-only fixtures) one target per virtual dimmer
      // so an intensity FX can fan across a bar's colour clusters.
      const a = f.addressOf(attr) || (attr === 'intensity' ? f.addressOf('intensity-master') : 0);
      if (a) push(f, [a]);
      else if (attr === 'intensity' && f.needsVirtualDimmer()) {
        for (const vd of f.virtualDimmers()) push(f, [vd.virtualAddr]);
      }
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
        const attr = L.curve?.attr ?? L.value?.attr ?? L.chaser?.attr ?? 'intensity';
        const { targets, ids } = targetsForKind(L.kind, attr, fxs);
        tl.targets = targets;
        tl.beamIds = ids;
      }
    });
  }
  return track;
}
