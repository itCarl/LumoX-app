import { describe, it, expect } from 'vitest';
import { Group, Patch, UniverseManager } from '../../src/index';
import { makeFixture } from '../helpers/defs';

describe('Group — membership by id', () => {
  it('add / remove / has / toggle accept ids or { id } objects', () => {
    const g = new Group({ id: 'g' });
    g.add('f1');
    g.add({ id: 'f2' });
    expect(g.has('f1')).toBe(true);
    expect(g.has({ id: 'f2' })).toBe(true);
    expect(g.size).toBe(2);
    g.remove('f1');
    expect(g.has('f1')).toBe(false);
    g.toggle('f2'); // present → removed
    expect(g.has('f2')).toBe(false);
    g.toggle('f3'); // absent → added
    expect(g.has('f3')).toBe(true);
  });

  it('clear empties the group', () => {
    const g = new Group({ fixtureIds: ['a', 'b'] });
    g.clear();
    expect(g.size).toBe(0);
  });

  it('resolves member ids to live fixtures, skipping missing ones', () => {
    const p = new Patch();
    const a = makeFixture(['intensity'], { id: 'a' });
    p.add(a);
    const g = new Group({ fixtureIds: ['a', 'ghost'] });
    expect(g.fixtures(p)).toEqual([a]);
  });
});

describe('Group — batch ops', () => {
  it('set applies a typed value to every member that has the channel', () => {
    const p = new Patch();
    p.add(makeFixture(['intensity'], { id: 'a' }));
    p.add(makeFixture(['red', 'green', 'blue'], { id: 'b' })); // no intensity channel
    const g = new Group({ fixtureIds: ['a', 'b'] });
    g.setIntensity(p, 200);
    expect(p.get('a')!.get('intensity')).toBe(200);
  });

  it('setRGB writes colour to RGB members', () => {
    const p = new Patch();
    p.add(makeFixture(['red', 'green', 'blue'], { id: 'rgb' }));
    new Group({ fixtureIds: ['rgb'] }).setRGB(p, 10, 20, 30);
    const fx = p.get('rgb')!;
    expect([fx.get('red'), fx.get('green'), fx.get('blue')]).toEqual([10, 20, 30]);
  });

  it('apply flushes members into their universe', () => {
    const um = new UniverseManager(); um.ensure(0);
    const p = new Patch();
    p.add(makeFixture(['intensity'], { id: 'a', startAddress: 3 }));
    const g = new Group({ fixtureIds: ['a'] });
    g.setIntensity(p, 150).apply(p, um);
    expect(um.get(0)!.getProgrammerChannel(3)).toBe(150);
  });

  it('channelAddresses lists every owned address keyed by universe', () => {
    const p = new Patch();
    p.add(makeFixture(['intensity', 'red'], { id: 'a', startAddress: 1 }));
    const map = new Group({ fixtureIds: ['a'] }).channelAddresses(p);
    expect(map.get(0)).toEqual([1, 2]);
  });
});

describe('Group — serialization', () => {
  it('round-trips through toJSON / fromJSON', () => {
    const g = new Group({ id: 'g', name: 'Wash', color: '#ff0000', fixtureIds: ['a', 'b'] });
    const clone = Group.fromJSON(g.toJSON());
    expect(clone.id).toBe('g');
    expect(clone.name).toBe('Wash');
    expect(clone.color).toBe('#ff0000');
    expect(clone.list()).toEqual(['a', 'b']);
  });
});
