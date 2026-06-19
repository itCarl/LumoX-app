// 28 — MATRIX FX: per-emitter pixel-mapping from 2D stage positions.
//
// Builds a 5×5 RGB matrix fixture, places it on the stage, and runs a MATRIX FX
// 'wipe' layer through the SceneMixer — exactly the path the app wires up:
//   Fixture.emitterColorAddresses()  → per-emitter [r,g,b] channel tuples
//   Fixture.emitterWorldPositions()  → per-emitter 2D world coordinates
//   renderMatrixFx                   → colour from each emitter's position
//
// Self-checks the spatial invariants, so it doubles as a regression test:
//   npm run example examples/28-matrix-fx.ts

import assert from 'node:assert';
import {
  SceneMixer, Universe, Fixture, FixtureDefinition,
  type StageTransform,
} from '../src/index';

// ---- a 5×5 RGB matrix definition (75ch, row-major [R,G,B] per cell) ---------
const COLS = 5, ROWS = 5, N = COLS * ROWS;
const channels: { typeId: string; name: string }[] = [];
const layout: { x: number; y: number }[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    channels.push({ typeId: 'red', name: `R${r}${c}` }, { typeId: 'green', name: `G${r}${c}` }, { typeId: 'blue', name: `B${r}${c}` });
    layout.push({ x: c / (COLS - 1), y: r / (ROWS - 1) });
  }
}
const def = new FixtureDefinition({
  id: 'demo/led-matrix-5x5', manufacturer: 'Demo', model: 'LED Matrix 5×5', type: 'LED Matrix',
  emitterLayout: layout,
  modes: [{ name: 'RGB', channels }],
});
assert.strictEqual(def.emitters, N, '25 emitters from layout');

const fx = new Fixture({ definition: def, universeId: 0, startAddress: 1 });

// ---- replicate the app's matrixTargets (main/context.ts) --------------------
function matrixTargets(f: Fixture) {
  const cells = f.emitterColorAddresses();
  const worlds = f.emitterWorldPositions();
  const targets = cells.map((c) => [c.r, c.g, c.b]);
  return { targets: { 0: targets }, positions: { 0: worlds } };
}

// ---- drive the SceneMixer ---------------------------------------------------
const mixer = new SceneMixer();
const u0 = new Universe(0);
let now = 0;
const ctx = { now: 0, deltaMs: 0, frame: 0 };
function tick(deltaMs: number): void {
  now += deltaMs; ctx.now = now; ctx.deltaMs = deltaMs; ctx.frame++;
  mixer.update(deltaMs);
  u0.data.fill(0);
  mixer.process(u0, ctx);
}

function addMatrixTrack(transform: Partial<StageTransform>, angle: number) {
  fx.stageTransform = { x: 0, y: 0, rotation: 0, ...transform };
  const { targets, positions } = matrixTargets(fx);
  mixer.removeTrack('mtx');
  mixer.addTrack({
    id: 'mtx', type: 'static', opacity: 1, values: {},
    layers: [{
      id: 'L1', kind: 'matrix', enabled: true,
      rateMs: 100000, speed: 1, driveMode: 'off', beatDiv: 1, direction: 'forward',
      size: 96, spread: 30,
      matrix: { pattern: 'wipe', palette: [], saturation: 1, fade: 1, angle, scale: 0.5 },
      targets, positions,
    }],
  } as any);
}

const rgb = (k: number) => [u0.data[3 * k], u0.data[3 * k + 1], u0.data[3 * k + 2]];
const col = (k: number) => k % COLS;
const row = (k: number) => Math.floor(k / COLS);
const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// ---- (a) horizontal wipe: colour varies by column, constant down a column ---
addMatrixTrack({}, 0);
tick(0);
let lit = 0;
for (let k = 0; k < N; k++) if (rgb(k).some((v) => v > 0)) lit++;
assert.strictEqual(lit, N, 'every emitter is lit (per-pixel output)');

for (let c = 0; c < COLS; c++) {
  const base = rgb(c);                                  // row 0, this column
  for (let r = 1; r < ROWS; r++) assert.ok(same(base, rgb(r * COLS + c)), `column ${c} is uniform down rows`);
}
assert.ok(!same(rgb(col(0)), rgb(COLS - 1)), 'left vs right columns differ (gradient across X)');
console.log('(a) horizontal wipe      OK  — gradient across columns, uniform per column');

// ---- (b) vertical wipe (angle 90°): now varies by row, constant across a row -
addMatrixTrack({}, 90);
tick(0);
for (let r = 0; r < ROWS; r++) {
  const base = rgb(r * COLS);
  for (let c = 1; c < COLS; c++) assert.ok(same(base, rgb(r * COLS + c)), `row ${r} is uniform across columns`);
}
assert.ok(!same(rgb(0), rgb((ROWS - 1) * COLS)), 'top vs bottom rows differ (gradient across Y)');
console.log('(b) vertical wipe        OK  — gradient across rows, uniform per row');

// ---- (c) rotating the fixture 90° swaps the wipe axis -----------------------
// A horizontal wipe on a fixture rotated 90° should behave like a vertical wipe:
// colour now constant across a row, varying down columns.
addMatrixTrack({ rotation: 90 }, 0);
tick(0);
for (let r = 0; r < ROWS; r++) {
  const base = rgb(r * COLS);
  for (let c = 1; c < COLS; c++) assert.ok(same(base, rgb(r * COLS + c)), `rotated: row ${r} uniform`);
}
assert.ok(!same(rgb(0), rgb((ROWS - 1) * COLS)), 'rotated 90° → wipe axis follows the fixture');
console.log('(c) fixture rotation     OK  — rotating the fixture rotates the pixel-map');

console.log('\nAll MATRIX FX invariants verified — per-emitter world coordinates drive colour.');
