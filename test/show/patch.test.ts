import { describe, it, expect } from 'vitest';
import { Patch, UniverseManager } from '../../src/index';
import { makeFixture } from '../helpers/defs';

describe('Patch — registry', () => {
  it('add / get / remove / list / clear', () => {
    const p = new Patch();
    const a = makeFixture(['intensity'], { id: 'a' });
    p.add(a);
    expect(p.get('a')).toBe(a);
    expect(p.list()).toEqual([a]);
    p.remove('a');
    expect(p.get('a')).toBeUndefined();
    p.add(a); p.clear();
    expect(p.list()).toEqual([]);
  });

  it('forUniverse filters by universe id', () => {
    const p = new Patch();
    p.add(makeFixture(['intensity'], { id: 'u0', universeId: 0 }));
    p.add(makeFixture(['intensity'], { id: 'u1', universeId: 1 }));
    expect(p.forUniverse(0).map((f) => f.id)).toEqual(['u0']);
    expect(p.forUniverse(1).map((f) => f.id)).toEqual(['u1']);
  });
});

describe('Patch — intensityChannels', () => {
  it('collects intensity-typed addresses keyed by universe', () => {
    const p = new Patch();
    // intensity at start 1 → addr 1; intensity at start 10 → addr 10
    p.add(makeFixture(['intensity', 'red', 'green', 'blue'], { id: 'a', startAddress: 1 }));
    p.add(makeFixture(['red', 'green', 'blue', 'intensity'], { id: 'b', startAddress: 10 }));
    const map = p.intensityChannels();
    expect([...map.get(0)!].sort((x, y) => x - y)).toEqual([1, 13]);
  });

  it('skips fixtures with no intensity channel', () => {
    const p = new Patch();
    p.add(makeFixture(['red', 'green', 'blue'], { id: 'rgb' }));
    expect(p.intensityChannels().size).toBe(0);
  });
});

describe('Patch — detectOverlaps', () => {
  it('reports id pairs whose address ranges collide in the same universe', () => {
    const p = new Patch();
    p.add(makeFixture(['intensity', 'red', 'green', 'blue'], { id: 'a', startAddress: 1 }));  // 1..4
    p.add(makeFixture(['intensity', 'red'], { id: 'b', startAddress: 4 }));                    // 4..5 → overlaps a
    p.add(makeFixture(['intensity'], { id: 'c', startAddress: 100 }));                         // clear
    expect(p.detectOverlaps()).toEqual([['a', 'b']]);
  });

  it('does not flag overlaps across different universes', () => {
    const p = new Patch();
    p.add(makeFixture(['intensity', 'red'], { id: 'a', startAddress: 1, universeId: 0 }));
    p.add(makeFixture(['intensity', 'red'], { id: 'b', startAddress: 1, universeId: 1 }));
    expect(p.detectOverlaps()).toEqual([]);
  });
});

describe('Patch — applyAll', () => {
  it('flushes each fixture into its universe programmer buffer', () => {
    const um = new UniverseManager();
    um.ensure(0);
    const p = new Patch();
    const fx = makeFixture(['intensity'], { id: 'a', startAddress: 5 });
    fx.set('intensity', 222);
    p.add(fx);
    p.applyAll(um);
    expect(um.get(0)!.getProgrammerChannel(5)).toBe(222);
  });
});
