import { describe, it, expect } from 'vitest';
import { buildMatrixDefinition, FixtureDefinition, Fixture } from '../../src/index';

describe('buildMatrixDefinition', () => {
  it('builds a W×H RGB matrix: one cell per grid position, R/G/B per cell', () => {
    const def = buildMatrixDefinition({ shape: 'matrix', width: 10, height: 5, color: 'rgb' });
    expect(def.model).toBe('Matrix 10x5 RGB');
    expect(def.type).toBe('LED Matrix');
    expect(def.emitterLayout).toHaveLength(50);
    const mode = def.modes![0] as { channels: unknown[]; emitters: number[][] };
    expect(mode.channels).toHaveLength(150);
    expect(mode.emitters).toHaveLength(50);
    expect(mode.emitters[0]).toEqual([1, 2, 3]);
    expect(mode.emitters[49]).toEqual([148, 149, 150]);
  });

  it('lays cells out row-major in normalized 0..1 space', () => {
    const def = buildMatrixDefinition({ shape: 'matrix', width: 10, height: 5, color: 'rgb' });
    expect(def.emitterLayout![0]).toEqual({ x: 0, y: 0 });
    expect(def.emitterLayout![9]).toEqual({ x: 1, y: 0 });   // end of first row
    expect(def.emitterLayout![49]).toEqual({ x: 1, y: 1 });  // bottom-right
  });

  it('adds white, per-cell dimmer and a leading master dimmer when requested', () => {
    const def = buildMatrixDefinition({ shape: 'strip', width: 12, height: 1, color: 'rgbw', cellDimmer: true, masterDimmer: true });
    expect(def.model).toBe('Strip 12 RGBW');
    expect(def.type).toBe('LED Bar');
    const mode = def.modes![0] as { channels: { typeId: string }[]; emitters: number[][] };
    expect(mode.channels[0].typeId).toBe('intensity-master');
    expect(mode.channels).toHaveLength(1 + 12 * 5);          // master + 12 cells × (R,G,B,W,Dim)
    expect(mode.emitters[0]).toEqual([2, 3, 4, 5, 6]);       // first cell after the master channel
  });

  it('forces a strip to a single row', () => {
    const def = buildMatrixDefinition({ shape: 'strip', width: 8, height: 9, color: 'rgb' });
    expect(def.emitterLayout).toHaveLength(8);
    expect(new Set(def.emitterLayout!.map((c) => c.y)).size).toBe(1);
  });

  it('throws when the grid exceeds one DMX universe', () => {
    expect(() => buildMatrixDefinition({ shape: 'matrix', width: 20, height: 20, color: 'rgb' }))
      .toThrow(/512-channel universe/);
  });

  it('produces a definition the engine resolves into addressable cells + positions', () => {
    const def = FixtureDefinition.fromJSON(buildMatrixDefinition({ shape: 'matrix', width: 4, height: 3, color: 'rgb' }));
    const fx = new Fixture({ name: 'M', definition: def, mode: def.defaultMode!, universeId: 0, startAddress: 1 });
    expect(fx.emitterCount).toBe(12);
    expect(fx.emitterColorAddresses()).toHaveLength(12);
    expect(fx.emitterWorldPositions()).toHaveLength(12);
    expect(fx.emitterColorAddresses()[0]).toMatchObject({ r: 1, g: 2, b: 3 });
  });
});
