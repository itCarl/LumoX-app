import { describe, it, expect } from 'vitest';
import {
  sanitizeTransform, normalizeTransform, denormalizeTransform, STAGE_SIZE,
  colorClusterCount, resolveEmitterCount, emitterGrid, emitterLocalPositions, emitterWorldPositions,
} from '../../src/index';

describe('sanitizeTransform', () => {
  it('defaults non-finite / missing fields to zero', () => {
    expect(sanitizeTransform(undefined)).toEqual({ x: 0, y: 0, rotation: 0 });
    expect(sanitizeTransform({ x: 5, y: NaN, rotation: '9' })).toEqual({ x: 5, y: 0, rotation: 0 });
  });
});

describe('normalize / denormalize transform', () => {
  it('normalizes over the fixed stage box and round-trips', () => {
    const world = { x: STAGE_SIZE.width / 2, y: STAGE_SIZE.height / 4, rotation: 45 };
    const norm = normalizeTransform(world);
    expect(norm).toEqual({ x: 0.5, y: 0.25, rotation: 45 });
    expect(denormalizeTransform(norm)).toEqual(world);
  });
});

describe('colorClusterCount', () => {
  it('is the min of red/green/blue channel counts', () => {
    expect(colorClusterCount([{ typeId: 'red' }, { typeId: 'green' }, { typeId: 'blue' }])).toBe(1);
    expect(colorClusterCount([
      { typeId: 'red' }, { typeId: 'green' }, { typeId: 'blue' },
      { typeId: 'red' }, { typeId: 'green' }, { typeId: 'blue' },
    ])).toBe(2);
    expect(colorClusterCount([{ typeId: 'red' }, { typeId: 'green' }])).toBe(0); // no blue
    expect(colorClusterCount([{ typeId: 'intensity' }, null])).toBe(0);
  });
});

describe('resolveEmitterCount', () => {
  it('is the largest signal — clusters, layout length, or declared count — at least 1', () => {
    expect(resolveEmitterCount([{ typeId: 'intensity' }], null)).toBe(1);
    expect(resolveEmitterCount([{ typeId: 'intensity' }], null, 4)).toBe(4);
    const rgb = [{ typeId: 'red' }, { typeId: 'green' }, { typeId: 'blue' }];
    expect(resolveEmitterCount([...rgb, ...rgb, ...rgb], null, 1)).toBe(3); // 3 clusters wins
    expect(resolveEmitterCount([{ typeId: 'intensity' }], [{ x: 0, y: 0 }, { x: 1, y: 0 }], 1)).toBe(2);
  });
});

describe('emitterGrid', () => {
  it('lays an unpositioned fixture out as a single horizontal row', () => {
    expect(emitterGrid({ emitters: 4, emitterLayout: null })).toMatchObject({ n: 4, cols: 4, rows: 1 });
  });

  it('derives the matrix shape from a positioned layout', () => {
    const layout = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    expect(emitterGrid({ emitters: 4, emitterLayout: layout })).toMatchObject({ n: 4, cols: 2, rows: 2 });
  });
});

describe('emitterLocalPositions', () => {
  it('places row cells at grid-cell centres', () => {
    expect(emitterLocalPositions({ emitters: 3, emitterLayout: null })).toEqual([
      { x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 }, { x: 2.5, y: 0.5 },
    ]);
  });
});

describe('emitterWorldPositions', () => {
  it('with an identity transform equals the local positions', () => {
    const src = { emitters: 2, emitterLayout: null };
    expect(emitterWorldPositions(src, { x: 0, y: 0, rotation: 0 }))
      .toEqual(emitterLocalPositions(src));
  });

  it('translates by the transform origin', () => {
    const world = emitterWorldPositions({ emitters: 1, emitterLayout: null }, { x: 10, y: 20, rotation: 0 });
    expect(world[0].x).toBeCloseTo(10.5, 5);
    expect(world[0].y).toBeCloseTo(20.5, 5);
  });

  it('rotates the footprint about its centre', () => {
    // single row of 2 cells, centre at (1, 0.5); a 180° spin swaps the two cells
    const src = { emitters: 2, emitterLayout: null };
    const spun = emitterWorldPositions(src, { x: 0, y: 0, rotation: 180 });
    expect(spun[0].x).toBeCloseTo(1.5, 5);
    expect(spun[1].x).toBeCloseTo(0.5, 5);
  });
});
