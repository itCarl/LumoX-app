import { describe, it, expect } from 'vitest';
import {
  FixtureDefinition, FixtureMode, ChannelDefinition, ChannelTypeRegistry,
} from '../../src/index';

describe('ChannelDefinition', () => {
  it('inherits name + defaultValue from the registered type', () => {
    const c = new ChannelDefinition({ typeId: 'red' });
    expect(c.name).toBe('Red');
    expect(c.type?.isColor).toBe(true);
    expect(c.defaultValue).toBe(0);
  });

  it('rejects an unknown type id', () => {
    expect(() => new ChannelDefinition({ typeId: 'not-a-type' })).toThrow(/Unknown channel type/);
  });

  it('masks defaultValue to a byte', () => {
    expect(new ChannelDefinition({ typeId: 'intensity', defaultValue: 300 }).defaultValue).toBe(300 & 0xff);
  });
});

describe('FixtureMode', () => {
  const mode = new FixtureMode({
    name: '4ch',
    channels: [{ typeId: 'intensity' }, { typeId: 'red' }, { typeId: 'green' }, { typeId: 'blue' }],
  });

  it('indexOfType returns the 1-based slot or 0 when absent', () => {
    expect(mode.indexOfType('intensity')).toBe(1);
    expect(mode.indexOfType('blue')).toBe(4);
    expect(mode.indexOfType('pan')).toBe(0);
  });

  it('indicesWhere collects matching slots', () => {
    expect(mode.indicesWhere((c) => !!c.type?.isColor)).toEqual([2, 3, 4]);
  });

  it('skips null slots in lookups (e.g. an unused channel)', () => {
    // Channels can hold null for an unused slot; the lookups guard against it.
    const m = new FixtureMode({ name: 'gap', channels: [{ typeId: 'intensity' }, { typeId: 'red' }] });
    m.channels.splice(1, 0, null); // intensity, <gap>, red
    expect(m.channelCount).toBe(3);
    expect(m.indexOfType('red')).toBe(3);
    expect(m.indicesWhere((c) => !!c.type?.isIntensity)).toEqual([1]);
  });
});

describe('FixtureDefinition', () => {
  it('derives id from manufacturer/model and exposes the default mode', () => {
    const def = new FixtureDefinition({
      manufacturer: 'Acme', model: 'Spot 200',
      modes: [{ name: 'Basic', channels: [{ typeId: 'intensity' }] }],
    });
    expect(def.id).toBe('Acme/Spot 200');
    expect(def.defaultMode?.name).toBe('Basic');
    expect(def.mode('Basic')).toBe(def.defaultMode);
    expect(def.mode('Nope')).toBeNull();
  });

  it('an emitterLayout overrides the numeric emitter count', () => {
    const def = new FixtureDefinition({
      manufacturer: 'Acme', model: 'Bar',
      emitters: 1,
      emitterLayout: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }],
      modes: [{ name: 'm', channels: [{ typeId: 'intensity' }] }],
    });
    expect(def.emitters).toBe(3);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const def = new FixtureDefinition({
      manufacturer: 'Acme', model: 'Wash',
      modes: [{ name: 'm', channels: [{ typeId: 'red' }, { typeId: 'green' }, { typeId: 'blue' }] }],
    });
    const clone = FixtureDefinition.fromJSON(def.toJSON());
    expect(clone.id).toBe(def.id);
    expect(clone.defaultMode?.channels.map((c) => c?.typeId)).toEqual(['red', 'green', 'blue']);
  });
});

describe('ChannelTypeRegistry — built-ins are bootstrapped', () => {
  it('knows the core DMX channel types', () => {
    expect(ChannelTypeRegistry.has('intensity')).toBe(true);
    expect(ChannelTypeRegistry.has('pan-fine')).toBe(true);
    expect(ChannelTypeRegistry.get('pan-fine')?.fineOf).toBe('pan');
    expect(ChannelTypeRegistry.intensities().some((t) => t.id === 'intensity')).toBe(true);
  });
});
