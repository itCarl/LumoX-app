import { describe, it, expect } from 'vitest';
import { Universe, DMX_CHANNELS } from '../../src/index';
import { makeFixture } from '../helpers/defs';

describe('Fixture — addressing', () => {
  it('exposes channelCount and endAddress from its mode + start', () => {
    const fx = makeFixture(['intensity', 'red', 'green', 'blue'], { startAddress: 10 });
    expect(fx.channelCount).toBe(4);
    expect(fx.endAddress).toBe(13);
  });

  it('addressOf / fineAddressOf resolve typed channels to absolute addresses', () => {
    const fx = makeFixture(['pan', 'pan-fine', 'tilt', 'tilt-fine'], { startAddress: 5 });
    expect(fx.addressOf('pan')).toBe(5);
    expect(fx.addressOf('tilt')).toBe(7);
    expect(fx.fineAddressOf('pan')).toBe(6);
    expect(fx.addressOf('missing')).toBe(0);
  });

  it('intensityAddresses lists every intensity-typed slot', () => {
    const fx = makeFixture(['intensity', 'red', 'green', 'blue'], { startAddress: 1 });
    expect(fx.intensityAddresses()).toEqual([1]);
  });
});

describe('Fixture — writing values', () => {
  it('set by type id writes into the values buffer; get reads it back', () => {
    const fx = makeFixture(['intensity', 'red']);
    expect(fx.set('intensity', 200)).toBe(true);
    expect(fx.get('intensity')).toBe(200);
    expect(fx.set('green', 50)).toBe(false); // not in mode
  });

  it('setChannel is 1-based fixture-local and ignores out-of-range', () => {
    const fx = makeFixture(['intensity', 'red']);
    fx.setChannel(2, 99);
    expect(fx.get('red')).toBe(99);
    fx.setChannel(0, 5); fx.setChannel(99, 5); // ignored
    expect(fx.values[0]).toBe(0);
  });

  it('set16 splits a 16-bit value across coarse + fine', () => {
    const fx = makeFixture(['pan', 'pan-fine']);
    fx.set16('pan', 0x1234);
    expect(fx.get('pan')).toBe(0x12);
    expect(fx.get('pan-fine')).toBe(0x34);
  });

  it('setPanTilt drives both 16-bit axes', () => {
    const fx = makeFixture(['pan', 'pan-fine', 'tilt', 'tilt-fine']);
    fx.setPanTilt(0xabcd, 0x00ff);
    expect([fx.get('pan'), fx.get('pan-fine')]).toEqual([0xab, 0xcd]);
    expect([fx.get('tilt'), fx.get('tilt-fine')]).toEqual([0x00, 0xff]);
  });
});

describe('Fixture — flushing to a universe', () => {
  it('apply writes values into the programmer at the start address', () => {
    const fx = makeFixture(['intensity', 'red', 'green', 'blue'], { startAddress: 4 });
    fx.setRGB(10, 20, 30);
    const u = new Universe(0);
    fx.apply(u);
    expect(u.getProgrammerChannel(4)).toBe(0);   // intensity default
    expect(u.getProgrammerChannel(5)).toBe(10);  // red
    expect(u.getProgrammerChannel(6)).toBe(20);
    expect(u.getProgrammerChannel(7)).toBe(30);
  });

  it('liveApply auto-flushes through a bound universe target', () => {
    const fx = makeFixture(['intensity'], { startAddress: 2 });
    fx.liveApply = true;
    const u = new Universe(0);
    fx.bind(u);
    fx.set('intensity', 123);
    expect(u.getProgrammerChannel(2)).toBe(123);
  });
});

describe('Fixture — virtual dimmers (RGB-only)', () => {
  it('an RGB-only fixture needs a virtual dimmer with a virtual-region address', () => {
    const fx = makeFixture(['red', 'green', 'blue'], { startAddress: 1 });
    expect(fx.hasIntensityChannel()).toBe(false);
    expect(fx.needsVirtualDimmer()).toBe(true);
    const vds = fx.virtualDimmers();
    expect(vds).toEqual([{ virtualAddr: DMX_CHANNELS + 1, r: 1, g: 2, b: 3 }]);
  });

  it('a fixture with an intensity channel needs no virtual dimmer', () => {
    const fx = makeFixture(['intensity', 'red', 'green', 'blue']);
    expect(fx.needsVirtualDimmer()).toBe(false);
    expect(fx.virtualDimmers()).toEqual([]);
  });

  it('an intensity write on an RGB-only fixture drives every virtual level', () => {
    const fx = makeFixture(['red', 'green', 'blue']);
    expect(fx.set('intensity', 128)).toBe(true);
    expect([...fx.virtualLevels]).toEqual([128]);
  });
});

describe('Fixture — emitter colour addresses', () => {
  it('replicates a single cluster across declared emitter cells', () => {
    const fx = makeFixture(['red', 'green', 'blue'], { startAddress: 1, emitters: 3 });
    expect(fx.emitterCount).toBe(3);
    expect(fx.emitterColorAddresses()).toEqual([
      { r: 1, g: 2, b: 3 }, { r: 1, g: 2, b: 3 }, { r: 1, g: 2, b: 3 },
    ]);
  });

  it('maps one cluster per repeated RGB block', () => {
    const fx = makeFixture(['red', 'green', 'blue', 'red', 'green', 'blue'], { startAddress: 1 });
    expect(fx.emitterColorAddresses()).toEqual([
      { r: 1, g: 2, b: 3 }, { r: 4, g: 5, b: 6 },
    ]);
  });
});
