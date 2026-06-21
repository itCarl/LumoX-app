import { describe, it, expect } from 'vitest';
import { Universe, DMX_CHANNELS, VIRTUAL_CHANNELS, TOTAL_CHANNELS } from '../../src/index';

describe('Universe buffers', () => {
  it('allocates real + virtual channels', () => {
    const u = new Universe(0);
    expect(TOTAL_CHANNELS).toBe(DMX_CHANNELS + VIRTUAL_CHANNELS);
    expect(u.programmer.length).toBe(TOTAL_CHANNELS);
    expect(u.data.length).toBe(TOTAL_CHANNELS);
    expect(u.engaged.length).toBe(TOTAL_CHANNELS);
  });

  it('setChannel is 1-indexed and masks to a byte', () => {
    const u = new Universe(0);
    u.setChannel(1, 200);
    u.setChannel(512, 0x1ff); // 511 → wraps to a byte
    expect(u.getProgrammerChannel(1)).toBe(200);
    expect(u.getProgrammerChannel(512)).toBe(0xff);
  });

  it('ignores out-of-range addresses on both ends', () => {
    const u = new Universe(0);
    u.setChannel(0, 100);
    u.setChannel(TOTAL_CHANNELS + 1, 100);
    expect(u.getProgrammerChannel(0)).toBe(0);
    expect(u.getProgrammerChannel(TOTAL_CHANNELS + 1)).toBe(0);
  });

  it('accepts virtual-region writes above the wire channels', () => {
    const u = new Universe(0);
    u.setChannel(DMX_CHANNELS + 1, 255);
    expect(u.getProgrammerChannel(DMX_CHANNELS + 1)).toBe(255);
  });

  it('getChannel reads the mixed `data` buffer, not the programmer', () => {
    const u = new Universe(0);
    u.setChannel(1, 123);          // programmer only
    expect(u.getChannel(1)).toBe(0); // data is still zero (no mix has run)
    u.data[0] = 77;
    expect(u.getChannel(1)).toBe(77);
  });
});

describe('Universe engaged mask (programmer vs scene capture)', () => {
  it('engage sets value AND the engaged flag; setChannel does not', () => {
    const u = new Universe(0);
    u.setChannel(1, 50);
    u.engage(2, 60);
    expect(u.engaged[0]).toBe(0); // setChannel left the mask untouched
    expect(u.engaged[1]).toBe(1); // engage flagged it
    expect(u.getProgrammerChannel(2)).toBe(60);
  });

  it('release zeroes the value and clears the flag', () => {
    const u = new Universe(0);
    u.engage(5, 200);
    u.release(5);
    expect(u.getProgrammerChannel(5)).toBe(0);
    expect(u.engaged[4]).toBe(0);
  });

  it('fillProgrammer clears both values and the engaged mask', () => {
    const u = new Universe(0);
    u.engage(1, 255);
    u.engage(10, 128);
    u.fillProgrammer(0);
    expect(u.getProgrammerChannel(1)).toBe(0);
    expect(u.engaged.some((b) => b !== 0)).toBe(false);
  });

  it('setRange writes a block without engaging', () => {
    const u = new Universe(0);
    u.setRange(3, [10, 20, 30]);
    expect([u.getProgrammerChannel(3), u.getProgrammerChannel(4), u.getProgrammerChannel(5)]).toEqual([10, 20, 30]);
    expect(u.engaged.some((b) => b !== 0)).toBe(false);
  });
});
