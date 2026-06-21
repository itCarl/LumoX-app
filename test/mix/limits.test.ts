import { describe, it, expect } from 'vitest';
import { Limits, Universe } from '../../src/index';
import type { LimitMap } from '../../src/index';
import type { MixContext } from '../../src/mix/MixModule';

const ctx: MixContext = { now: 0, deltaMs: 0, frame: 0 };

function run(map: LimitMap, channels: Record<number, number>): Universe {
  const u = new Universe(0);
  for (const [ch, v] of Object.entries(channels)) u.data[Number(ch) - 1] = v;
  const limits = new Limits();
  limits.setMap(map);
  limits.process(u, ctx);
  return u;
}

describe('Limits — dimmer cap', () => {
  it('clamps intensity to the ceiling without rescaling lower values', () => {
    const map: LimitMap = new Map([[0, [{ dimmer: { addrs: [1], max: 200 } }]]]);
    expect(run(map, { 1: 255 }).getChannel(1)).toBe(200); // capped
    expect(run(map, { 1: 150 }).getChannel(1)).toBe(150); // below cap, untouched
  });
});

describe('Limits — pan/tilt range remap (8-bit)', () => {
  it('linearly maps the full input range into [min,max]', () => {
    const map: LimitMap = new Map([[0, [{ pan: { addr: 1, fine: 0, min: 0, max: 128, invert: false } }]]]);
    expect(run(map, { 1: 255 }).getChannel(1)).toBe(128); // top of input → top of window
    expect(run(map, { 1: 0 }).getChannel(1)).toBe(0);     // bottom → bottom of window
  });

  it('inverts the axis when requested', () => {
    const map: LimitMap = new Map([[0, [{ pan: { addr: 1, fine: 0, min: 0, max: 255, invert: true } }]]]);
    expect(run(map, { 1: 0 }).getChannel(1)).toBe(255);
    expect(run(map, { 1: 255 }).getChannel(1)).toBe(0);
  });
});

describe('Limits — pan/tilt range remap (16-bit)', () => {
  it('maps across the coarse+fine pair', () => {
    // full input (0xFFFF) into a [0, 128] window → 128 × 257 = 0x8080, so both
    // the coarse and fine output bytes are 128.
    const map: LimitMap = new Map([[0, [{ pan: { addr: 1, fine: 2, min: 0, max: 128, invert: false } }]]]);
    const u = run(map, { 1: 0xff, 2: 0xff });
    expect(u.getChannel(1)).toBe(128);
    expect(u.getChannel(2)).toBe(128);

    // zero input stays at the window floor on both bytes
    const lo = run(map, { 1: 0, 2: 0 });
    expect([lo.getChannel(1), lo.getChannel(2)]).toEqual([0, 0]);
  });
});

describe('Limits — pan/tilt swap', () => {
  it('exchanges the pan and tilt output bytes', () => {
    const map: LimitMap = new Map([[0, [{ swap: { pan: 1, panFine: 0, tilt: 2, tiltFine: 0 } }]]]);
    const u = run(map, { 1: 40, 2: 200 });
    expect([u.getChannel(1), u.getChannel(2)]).toEqual([200, 40]);
  });
});

describe('Limits — no entry for a universe', () => {
  it('passes the frame through untouched', () => {
    const u = run(new Map(), { 1: 123, 2: 45 });
    expect([u.getChannel(1), u.getChannel(2)]).toEqual([123, 45]);
  });
});
