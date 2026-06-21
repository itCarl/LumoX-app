import { describe, it, expect } from 'vitest';
import {
  VirtualDimmer, GrandMaster, Blackout, Effects, GroupEffects,
  sineEffect, strobeEffect, chaseEffect,
  rainbowGroupEffect, chaseGroupEffect, flashGroupEffect, sineIntensityGroupEffect,
  Universe, Patch, Group,
} from '../../src/index';
import type { MixContext } from '../../src/mix/MixModule';
import { makeFixture } from '../helpers/defs';

const ctx = (now = 0): MixContext => ({ now, deltaMs: 0, frame: 0 });

describe('VirtualDimmer', () => {
  it('scales a cluster\'s RGB by the composited virtual level', () => {
    const u = new Universe(0);
    u.data[0] = 200; u.data[1] = 100; u.data[2] = 50; // r,g,b at addrs 1,2,3
    u.data[512] = 128;                                // virtual addr 513 = half
    const vd = new VirtualDimmer();
    vd.setMap(new Map([[0, [{ virtualAddr: 513, r: 1, g: 2, b: 3 }]]]));
    vd.process(u, ctx());
    expect(u.data[0]).toBe((200 * 128 / 255) | 0);
    expect(u.data[1]).toBe((100 * 128 / 255) | 0);
    expect(u.data[2]).toBe((50 * 128 / 255) | 0);
  });

  it('a full virtual level (255) leaves the colour untouched', () => {
    const u = new Universe(0);
    u.data[0] = 200; u.data[512] = 255;
    const vd = new VirtualDimmer();
    vd.setMap(new Map([[0, [{ virtualAddr: 513, r: 1, g: 2, b: 3 }]]]));
    vd.process(u, ctx());
    expect(u.data[0]).toBe(200);
  });

  it('no cluster map for the universe is a no-op', () => {
    const u = new Universe(0);
    u.data[0] = 123;
    new VirtualDimmer().process(u, ctx());
    expect(u.data[0]).toBe(123);
  });
});

describe('GrandMaster — intensity-only mode', () => {
  it('scales only the masked channels', () => {
    const u = new Universe(0);
    u.data[0] = 200; u.data[1] = 200;
    const gm = new GrandMaster({ mode: 'intensity-only', intensityChannels: new Map([[0, new Set([1])]]) });
    gm.setValue(0.5);
    gm.process(u, ctx());
    expect(u.data[0]).toBe(100); // ch1 masked → scaled
    expect(u.data[1]).toBe(200); // ch2 not masked → untouched
  });

  it('setValue clamps to 0..1 and value >= 1 short-circuits', () => {
    const gm = new GrandMaster();
    gm.setValue(5); expect(gm.value).toBe(1);
    gm.setValue(-5); expect(gm.value).toBe(0);
  });
});

describe('Blackout — intensity-only mode', () => {
  it('zeroes only masked channels when active', () => {
    const u = new Universe(0);
    u.data[0] = 255; u.data[1] = 255;
    const bo = new Blackout({ mode: 'intensity-only', intensityChannels: new Map([[0, new Set([1])]]) });
    bo.set(true);
    bo.process(u, ctx());
    expect(u.data[0]).toBe(0);
    expect(u.data[1]).toBe(255);
  });

  it('toggle flips the active state', () => {
    const bo = new Blackout();
    expect(bo.active).toBe(false);
    bo.toggle(); expect(bo.active).toBe(true);
    bo.toggle(); expect(bo.active).toBe(false);
  });
});

describe('Effects host + built-in factories', () => {
  it('HTP-merges an enabled effect into the frame and honours universeIds', () => {
    const host = new Effects();
    host.add(sineEffect({ id: 's', channel: 1, periodMs: 2000, min: 0, max: 255, universeIds: [0] }));
    const u0 = new Universe(0), u1 = new Universe(1);
    host.process(u0, ctx(500)); // quarter period → sine peak
    host.process(u1, ctx(500));
    expect(u0.data[0]).toBe(255);
    expect(u1.data[0]).toBe(0);  // effect scoped to universe 0
  });

  it('skips disabled or zero-opacity effects', () => {
    const host = new Effects();
    const fx = host.add(sineEffect({ id: 's', channel: 1 }));
    fx.enabled = false;
    const u = new Universe(0);
    u.data[0] = 42;
    host.process(u, ctx(500));
    expect(u.data[0]).toBe(42);
  });

  it('strobeEffect is high in the first half-period, low in the second', () => {
    const fx = strobeEffect({ id: 'st', channels: [1], rateHz: 10 }); // half-period = 50ms
    const t = new Uint8Array(512);
    fx.render(new Universe(0), ctx(10), t); expect(t[0]).toBe(255);
    t.fill(0);
    fx.render(new Universe(0), ctx(60), t); expect(t[0]).toBe(0);
  });

  it('chaseEffect lights the active step group', () => {
    const fx = chaseEffect({ id: 'c', steps: [[1], [2]], stepMs: 100 });
    const t = new Uint8Array(512);
    fx.render(new Universe(0), ctx(0), t);   expect([t[0], t[1]]).toEqual([255, 0]);
    t.fill(0);
    fx.render(new Universe(0), ctx(100), t); expect([t[0], t[1]]).toEqual([0, 255]);
  });
});

describe('GroupEffects host + factories', () => {
  /** Wire a one-fixture group/patch and run the host. */
  function setup() {
    const patch = new Patch();
    const fx = makeFixture(['intensity', 'red', 'green', 'blue'], { id: 'f1', startAddress: 1 });
    patch.add(fx);
    const group = new Group({ id: 'g', fixtureIds: ['f1'] });
    const host = new GroupEffects();
    host.bindPatch(patch);
    return { host, group, u: new Universe(0) };
  }

  it('is a no-op without a bound patch', () => {
    const host = new GroupEffects();
    const u = new Universe(0); u.data[0] = 9;
    host.add(rainbowGroupEffect({ id: 'r', group: new Group({ fixtureIds: ['x'] }) }));
    host.process(u, ctx());
    expect(u.data[0]).toBe(9);
  });

  it('resolves type ids to addresses and HTP-blends rainbow output', () => {
    const { host, group, u } = setup();
    host.add(rainbowGroupEffect({ id: 'r', group, periodMs: 4000 }));
    host.process(u, ctx(0)); // idx0/count1 → hue 0 → red
    expect(u.data[0]).toBe(255); // intensity
    expect(u.data[1]).toBe(255); // red
    expect(u.data[2]).toBe(0);   // green
    expect(u.data[3]).toBe(0);   // blue
  });

  it('chaseGroupEffect lights only the active member', () => {
    const eff = chaseGroupEffect({ id: 'c', group: new Group({ fixtureIds: ['a', 'b'] }), stepMs: 100 });
    const writes: Record<string, number> = {};
    const write = (t: string, v: number) => { writes[t] = v; };
    eff.render({} as never, ctx(0), write, 1, 2); // step 0 active, this fixture is idx 1
    expect(writes).toEqual({});                    // not lit
    eff.render({} as never, ctx(0), write, 0, 2);  // idx 0 is the active step
    expect(writes.intensity).toBe(255);
  });

  it('flashGroupEffect pulses intensity at the configured rate', () => {
    const eff = flashGroupEffect({ id: 'f', group: new Group(), rateHz: 8 }); // half-period 62.5ms
    const writes: number[] = [];
    eff.render({} as never, ctx(0), (_t, v) => writes.push(v), 0, 1);
    eff.render({} as never, ctx(100), (_t, v) => writes.push(v), 0, 1);
    expect(writes).toEqual([255, 0]);
  });

  it('sineIntensityGroupEffect peaks a quarter period in', () => {
    const eff = sineIntensityGroupEffect({ id: 's', group: new Group(), periodMs: 2000, phaseSpread: 0 });
    let v = -1;
    eff.render({} as never, ctx(500), (_t, val) => { v = val; }, 0, 1);
    expect(v).toBe(255);
  });
});
